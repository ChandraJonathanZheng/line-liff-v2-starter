/* eslint-disable @next/next/no-img-element -- Supabase signed URLs are dynamic and short-lived. */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";

const emptyOrder = { menu: "", quantity: 1, price: "", notes: "" };
const formatAmount = (amount) => Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function compressMenuImage(file) {
  if (!file?.type.startsWith("image/")) throw new Error("Please select an image file.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("This image could not be opened.")); element.src = sourceUrl; });
    const scale = Math.min(1, 1600 / image.width, 1600 / image.height);
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Image compression failed."));
      if (blob.size > 1_500_000) return reject(new Error("Image is still above 1.5 MB. Please choose a smaller image."));
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Image compression failed.")); reader.readAsDataURL(blob);
    }, "image/webp", 0.78));
  } finally { URL.revokeObjectURL(sourceUrl); }
}

export default function Home({ liff, liffError }) {
  const [tenants, setTenants] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [tenantName, setTenantName] = useState("");
  const [activeTenant, setActiveTenant] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [loginState, setLoginState] = useState("loading");
  const [dataState, setDataState] = useState("loading");
  const [isWorking, setIsWorking] = useState(false);
  const [activeTab, setActiveTab] = useState("order");
  const [openArchiveTenantId, setOpenArchiveTenantId] = useState(null);
  const [error, setError] = useState("");

  const api = useCallback(async (method = "GET", body) => {
    const idToken = liff?.getIDToken();
    if (!idToken) throw new Error("Please reopen this app from LINE and sign in again.");
    const response = await fetch("/api/app", {
      method,
      headers: { Authorization: `Bearer ${idToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }, [liff]);

  const loadTenants = useCallback(async (silent = false) => {
    if (!silent) setDataState("loading");
    try { const data = await api(); setTenants(data.tenants || []); setError(""); }
    catch (requestError) { setError(requestError.message); }
    finally { setDataState("ready"); }
  }, [api]);

  useEffect(() => {
    if (!liff) return;
    if (!liff.isLoggedIn() || !liff.getAccessToken()) { liff.login(); return; }
    liff.getProfile().then(async (profile) => {
      setProfileName(profile.displayName || "LINE User");
      setLoginState("ready");
      const invite = new URLSearchParams(window.location.search).get("invite");
      try {
        if (invite) {
          await api("POST", { action: "invite.accept", token: invite });
          window.history.replaceState({}, "", window.location.pathname);
        }
        await loadTenants();
      } catch (requestError) { setError(requestError.message); setDataState("ready"); }
    }).catch(() => { setProfileName("LINE User"); setLoginState("ready"); loadTenants(); });
  }, [liff, api, loadTenants]);

  useEffect(() => {
    if (loginState !== "ready") return undefined;
    const refresh = () => {
      if (document.visibilityState === "visible" && !isWorking) loadTenants(true);
    };
    const interval = window.setInterval(refresh, 8000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [isWorking, loadTenants, loginState]);

  const updateField = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); };
  const openOrder = (tenant, order = null) => { setActiveTenant(tenant); setActiveOrder(order); setForm(order ? { ...order } : emptyOrder); setModal("order"); };
  const openTenant = (tenant = null) => { setEditingTenant(tenant); setTenantName(tenant?.name || ""); setModal("tenant"); };

  const saveTenant = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      await api("POST", editingTenant ? { action: "tenant.rename", tenantId: editingTenant.id, name: tenantName } : { action: "tenant.create", name: tenantName });
      setModal(null); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const saveOrder = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      await api("POST", { action: "order.save", tenantId: activeTenant.id, order: { ...form, id: activeOrder?.id } });
      setModal(null); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const deleteOrder = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.delete", tenantId: activeTenant.id, orderId: activeOrder.id }); setModal(null); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const inviteFriends = async (tenant) => {
    setIsWorking(true);
    try {
      const { token } = await api("POST", { action: "invite.create", tenantId: tenant.id });
      const url = `${window.location.origin}${window.location.pathname}?invite=${token}`;
      if (!liff?.isApiAvailable("shareTargetPicker")) throw new Error("Friend sharing is available only in a supported LINE app.");
      await liff.shareTargetPicker([{ type: "text", text: `Join my ${tenant.name} order group: ${url}` }], { isMultiple: true });
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const uploadMenu = async (event, tenant) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsWorking(true);
    try { await api("POST", { action: "menu.upload", tenantId: tenant.id, image: await compressMenuImage(file) }); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { event.target.value = ""; setIsWorking(false); }
  };

  const archiveOrders = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.archive", tenantId: activeTenant.id }); setModal(null); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const visibleTenants = tenants.filter((tenant) => activeTab === "archive" ? tenant.is_archived : !tenant.is_archived);

  return <><Head><title>一起點餐 · Order Together</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><nav className="top-tabs" aria-label="Order navigation"><button className={activeTab === "order" ? "top-tab active" : "top-tab"} onClick={() => setActiveTab("order")}>Order</button><span className="top-tab-divider" /><button className={activeTab === "archive" ? "top-tab active" : "top-tab"} onClick={() => setActiveTab("archive")}>Archive</button></nav>{isWorking && <div className="request-buffer" role="status" aria-live="polite"><div><span className="spinner" /><strong>Saving changes</strong><small>Please wait a moment…</small></div></div>}<main className="order-page"><div className="tenant-list">
    {liffError && <p className="liff-notice">LIFF connection unavailable: {liffError}</p>}
    {loginState === "loading" && !liffError && <p className="liff-notice">Checking LINE login…</p>}
    {error && <p className="app-error">{error}</p>}
    {(dataState === "loading" || isWorking) && <div className="loading-state"><span className="spinner" /> <span>{isWorking ? "Saving your changes…" : "Loading your tenants…"}</span></div>}
    {dataState === "ready" && !visibleTenants.length && <p className="empty-tab">No {activeTab === "archive" ? "archived" : "active"} tenants yet.</p>}
    {visibleTenants.map((tenant, index) => {
      if (tenant.is_archived) {
        const latestArchive = tenant.archives?.[0];
        return <details className="order-card archive-tenant-card" key={tenant.id} open={openArchiveTenantId === tenant.id} onToggle={(event) => setOpenArchiveTenantId(event.currentTarget.open ? tenant.id : null)}>
          <summary className="order-header archive-tenant-summary"><div><p className="eyebrow">ARCHIVED TENANT</p><div className="tenant-title"><h1>{tenant.name}</h1></div><p className="subtitle">{latestArchive ? `${latestArchive.total_items} items · Total ${formatAmount(latestArchive.total_amount)}` : "View archived orders"}</p></div><span className="archive-toggle-label">Show</span></summary>
          <section className="archive-section"><p className="eyebrow">ARCHIVED ORDERS</p>{tenant.archives?.map((archive) => <article className="archive-record" key={archive.id}><div className="archive-record-heading"><span>{new Date(archive.archived_at).toLocaleDateString()}</span><span>{archive.total_items} items · Total {formatAmount(archive.total_amount)}</span></div><ul>{archive.orders.map((order) => <li key={order.id}>{order.quantity}× {order.menu} <span>{order.ordered_by_name}</span></li>)}</ul></article>)}</section>
        </details>;
      }

      return <section className="order-card" key={tenant.id}><header className="order-header"><div><p className="eyebrow">{`TENANT GROUP ${index + 1}`}</p><div className="tenant-title"><h1>{tenant.name}</h1>{tenant.role === "owner" && <button className="edit-tenant" onClick={() => openTenant(tenant)}>Edit</button>}</div><p className="subtitle">一起接龍點餐，輕鬆總結每一份心意。</p></div><div className="order-count"><strong>{tenant.orders.reduce((total, order) => total + Number(order.quantity), 0)}</strong><span>items</span></div></header><div className="tenant-tools">{tenant.role === "owner" && <><button className="invite-button" onClick={() => inviteFriends(tenant)}>Invite LINE friends</button><label className="menu-upload"><input type="file" accept="image/*" onChange={(event) => uploadMenu(event, tenant)} />{tenant.menuImageUrl ? "Re-upload menu" : "Upload menu"}</label><button className="finish-button" disabled={!tenant.orders.length} onClick={() => { setActiveTenant(tenant); setModal("archive"); }}>Order Finish</button></>}</div><section className="menu-section"><div><p className="eyebrow">TENANT MENU</p><p>{tenant.menuImageUrl ? "Menu image · compressed for faster loading" : "Upload one menu image for this tenant."}</p></div>{tenant.menuImageUrl && <img src={tenant.menuImageUrl} alt={`${tenant.name} menu`} />}</section><div className="table-wrap"><table><thead><tr><th>Index</th><th>Menu</th><th>Quantity</th><th>Who order</th><th>Notes</th><th aria-label="Actions" /></tr></thead><tbody>{tenant.orders.length ? tenant.orders.map((order, orderIndex) => <tr key={order.id}><td data-label="Index">{String(orderIndex + 1).padStart(2, "0")}</td><td data-label="Menu" className="menu-name">{order.menu}</td><td data-label="Quantity"><span className="quantity">{order.quantity}</span></td><td data-label="Who order">{order.ordered_by_name}</td><td data-label="Notes" className="notes">{order.notes || "—"}</td><td className="actions"><button onClick={() => openOrder(tenant, order)}>Edit</button><button className="delete-link" onClick={() => { setActiveTenant(tenant); setActiveOrder(order); setModal("delete"); }}>Delete</button></td></tr>) : <tr><td className="empty-orders" colSpan="6">No active orders.</td></tr>}</tbody></table></div><button className="add-button" onClick={() => openOrder(tenant)} disabled={loginState !== "ready"}><span>＋</span>Add order</button></section>;
    })}
    {activeTab === "order" && <button className="add-tenant-button" onClick={() => openTenant()} disabled={loginState !== "ready"}><span>＋</span> Add Tenant</button>}
  </div></main>
  {modal === "tenant" && <div className="modal-backdrop"><form className="modal tenant-modal" onSubmit={saveTenant}><div className="modal-heading"><p className="eyebrow">{editingTenant ? "UPDATE TENANT" : "NEW TENANT"}</p><h2>{editingTenant ? "Edit tenant" : "Add tenant"}</h2></div><label>Tenant Name<input autoFocus required value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="e.g. 得正" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="tenant-submit-button">Submit</button></div></form></div>}
  {modal === "order" && <div className="modal-backdrop"><form className="modal" onSubmit={saveOrder}><div className="modal-heading"><p className="eyebrow">{activeOrder ? "UPDATE ORDER" : "NEW ORDER"}</p><h2>{activeOrder ? "Edit your order" : "Add an order"}</h2></div><div className="profile-summary"><span>Ordering as</span><strong>{profileName}</strong></div><label>Menu<input required name="menu" value={form.menu} onChange={updateField} placeholder="e.g. 珍珠奶茶" /></label><div className="form-grid"><label>Quantity<input required min="1" type="number" name="quantity" value={form.quantity} onChange={updateField} /></label><label>Price<input min="0" type="number" name="price" value={form.price} onChange={updateField} placeholder="65" /></label></div><label>Notes<textarea name="notes" value={form.notes || ""} onChange={updateField} placeholder="e.g. 微糖微冰" rows="3" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary-button">{activeOrder ? "Save" : "Add"}</button></div></form></div>}
  {modal === "delete" && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-icon">!</div><p className="eyebrow">REMOVE ORDER</p><h2>You sure?</h2><p>This order will be removed from the list.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>No</button><button className="danger-button" onClick={deleteOrder}>YES</button></div></section></div>}
  {modal === "archive" && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-icon">✓</div><p className="eyebrow">FINISH ORDER</p><h2>Archive this order?</h2><p>The active orders will be cleared and saved as an archive summary.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" onClick={archiveOrders}>Order Finish</button></div></section></div>}
  </>;
}
