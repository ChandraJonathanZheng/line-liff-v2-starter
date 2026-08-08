import { getLineIdentity } from "../../lib/server/line";
import { getSupabaseAdmin } from "../../lib/server/supabase";

// A compressed 1.5 MB WebP becomes roughly 2 MB when encoded as Base64 in JSON.
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };

const json = (response, status, body) => response.status(status).json(body);

async function authenticate(request) {
  const identity = await getLineIdentity(request);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("line_users").upsert({
    line_user_id: identity.sub,
    display_name: identity.name || "LINE User",
    picture_url: identity.picture || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { identity, supabase };
}

async function memberRole(supabase, tenantId, lineUserId) {
  const { data, error } = await supabase.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("line_user_id", lineUserId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("You do not have access to this tenant.");
  return data.role;
}

async function canModifyOrder(supabase, tenantId, orderId, lineUserId) {
  const role = await memberRole(supabase, tenantId, lineUserId);
  if (role === "owner") return true;
  const { data, error } = await supabase.from("tenant_orders").select("ordered_by_line_user_id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  return data?.ordered_by_line_user_id === lineUserId;
}

async function tenantState(supabase, lineUserId) {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("role, tenant:tenants(id, name, owner_line_user_id, menu_image_path, is_archived, tenant_orders(id, menu, quantity, price, notes, ordered_by_name, ordered_by_line_user_id, created_at), tenant_archives(id, orders, total_items, total_amount, archived_at))")
    .eq("line_user_id", lineUserId)
    .order("created_at", { referencedTable: "tenants", ascending: true });
  if (error) throw error;
  return Promise.all((data || []).map(async ({ role, tenant }) => {
    let menuImageUrl = null;
    if (tenant.menu_image_path) {
      const { data: signedImage } = await supabase.storage.from("tenant-menu-images").createSignedUrl(tenant.menu_image_path, 60 * 60);
      menuImageUrl = signedImage?.signedUrl || null;
    }
    return { ...tenant, role, menuImageUrl, orders: tenant.tenant_orders || [], archives: tenant.tenant_archives || [] };
  }));
}

export default async function handler(request, response) {
  try {
    const { identity, supabase } = await authenticate(request);
    if (request.method === "GET") return json(response, 200, { tenants: await tenantState(supabase, identity.sub) });
    if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });

    const { action } = request.body || {};
    if (action === "tenant.create") {
      const name = request.body.name?.trim();
      if (!name) return json(response, 400, { error: "Tenant name is required." });
      const { data: tenant, error } = await supabase.from("tenants").insert({ name, owner_line_user_id: identity.sub }).select().single();
      if (error) throw error;
      const { error: memberError } = await supabase.from("tenant_members").insert({ tenant_id: tenant.id, line_user_id: identity.sub, role: "owner" });
      if (memberError) throw memberError;
      return json(response, 201, { tenant });
    }

    if (action === "tenant.rename") {
      const name = request.body.name?.trim();
      if (!name) return json(response, 400, { error: "Tenant name is required." });
      if (await memberRole(supabase, request.body.tenantId, identity.sub) !== "owner") return json(response, 403, { error: "Only the owner can rename this tenant." });
      const { error } = await supabase.from("tenants").update({ name, updated_at: new Date().toISOString() }).eq("id", request.body.tenantId);
      if (error) throw error;
      return json(response, 200, { ok: true });
    }

    if (action === "menu.upload") {
      const { tenantId, image } = request.body;
      if (await memberRole(supabase, tenantId, identity.sub) !== "owner") return json(response, 403, { error: "Only the owner can change the menu image." });
      const match = /^data:(image\/webp);base64,(.+)$/.exec(image || "");
      if (!match) return json(response, 400, { error: "Please upload a compressed WebP image." });
      const file = Buffer.from(match[2], "base64");
      if (!file.length || file.length > 1_500_000) return json(response, 400, { error: "Compressed image must be smaller than 1.5 MB." });
      const path = `${tenantId}/menu.webp`;
      const { error: uploadError } = await supabase.storage.from("tenant-menu-images").upload(path, file, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("tenants").update({ menu_image_path: path, updated_at: new Date().toISOString() }).eq("id", tenantId);
      if (error) throw error;
      return json(response, 200, { ok: true });
    }

    if (action === "order.save") {
      const { tenantId, order } = request.body;
      await memberRole(supabase, tenantId, identity.sub);
      if (order.id && !(await canModifyOrder(supabase, tenantId, order.id, identity.sub))) return json(response, 403, { error: "You can edit only your own order." });
      const payload = { tenant_id: tenantId, menu: order.menu?.trim(), quantity: Math.max(1, Number(order.quantity) || 1), price: Math.max(0, Number(order.price) || 0), notes: order.notes?.trim() || null, ordered_by_line_user_id: identity.sub, ordered_by_name: identity.name || "LINE User" };
      if (!payload.menu) return json(response, 400, { error: "Menu is required." });
      const query = order.id ? supabase.from("tenant_orders").update(payload).eq("id", order.id).eq("tenant_id", tenantId) : supabase.from("tenant_orders").insert(payload);
      const { error } = await query;
      if (error) throw error;
      return json(response, 200, { ok: true });
    }

    if (action === "order.delete") {
      if (!(await canModifyOrder(supabase, request.body.tenantId, request.body.orderId, identity.sub))) return json(response, 403, { error: "You can delete only your own order." });
      const { error } = await supabase.from("tenant_orders").delete().eq("id", request.body.orderId).eq("tenant_id", request.body.tenantId);
      if (error) throw error;
      return json(response, 200, { ok: true });
    }

    if (action === "order.archive") {
      const { tenantId } = request.body;
      if (await memberRole(supabase, tenantId, identity.sub) !== "owner") return json(response, 403, { error: "Only the owner can finish this order." });
      const { data: orders, error: orderError } = await supabase.from("tenant_orders").select("id, menu, quantity, price, notes, ordered_by_name, created_at").eq("tenant_id", tenantId).order("created_at");
      if (orderError) throw orderError;
      if (!orders?.length) return json(response, 400, { error: "There are no active orders to archive." });
      const totalItems = orders.reduce((total, order) => total + Number(order.quantity), 0);
      const totalAmount = orders.reduce((total, order) => total + Number(order.quantity) * Number(order.price), 0);
      const { error: archiveError } = await supabase.from("tenant_archives").insert({ tenant_id: tenantId, orders, total_items: totalItems, total_amount: totalAmount, archived_by_line_user_id: identity.sub });
      if (archiveError) throw archiveError;
      const { error: deleteError } = await supabase.from("tenant_orders").delete().eq("tenant_id", tenantId);
      if (deleteError) throw deleteError;
      const { error: tenantError } = await supabase.from("tenants").update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", tenantId);
      if (tenantError) throw tenantError;
      return json(response, 200, { ok: true });
    }

    if (action === "invite.create") {
      if (await memberRole(supabase, request.body.tenantId, identity.sub) !== "owner") return json(response, 403, { error: "Only the owner can invite friends." });
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("tenant_invites").insert({ token, tenant_id: request.body.tenantId, created_by_line_user_id: identity.sub, expires_at: expiresAt });
      if (error) throw error;
      return json(response, 201, { token, expiresAt });
    }

    if (action === "invite.accept") {
      const { data: invite, error } = await supabase.from("tenant_invites").select("tenant_id, expires_at").eq("token", request.body.token).maybeSingle();
      if (error) throw error;
      if (!invite || new Date(invite.expires_at) < new Date()) return json(response, 404, { error: "This invitation is invalid or has expired." });
      const { error: joinError } = await supabase.from("tenant_members").upsert({ tenant_id: invite.tenant_id, line_user_id: identity.sub, role: "member" }, { onConflict: "tenant_id,line_user_id", ignoreDuplicates: true });
      if (joinError) throw joinError;
      return json(response, 200, { ok: true });
    }
    return json(response, 400, { error: "Unknown action." });
  } catch (error) {
    return json(response, 500, { error: error.message || "Unexpected server error." });
  }
}
