/* eslint-disable @next/next/no-img-element -- Supabase signed URLs are dynamic and short-lived. */
import Head from "next/head";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const emptyOrder = { menu: "", quantity: 1, price: "", notes: "" };
const formatAmount = (amount) => Number(amount || 0).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatCurrency = (amount) => `Rp${formatAmount(amount)}`;
const orderTotal = (order) => Number(order.quantity || 0) * Number(order.price || 0);
const localDateTimeValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const formatDeadline = (value) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not set";
const orderStatus = (deadline) => {
  if (!deadline) return { label: "DIBUKA", className: "open" };
  const difference = new Date(deadline).getTime() - Date.now();
  if (difference <= 0) return { label: "DEADLINE PASSED", className: "closed" };
  if (difference <= 2 * 60 * 60 * 1000) return { label: "CLOSING SOON", className: "closing" };
  return { label: "OPEN", className: "open" };
};

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
  const [tenantDescription, setTenantDescription] = useState("");
  const [tenantDeadline, setTenantDeadline] = useState("");
  const [tenantPickupNotes, setTenantPickupNotes] = useState("");
  const [tenantPaymentNotes, setTenantPaymentNotes] = useState("");
  const [activeTenant, setActiveTenant] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [viewerId, setViewerId] = useState("");
  const [loginState, setLoginState] = useState("loading");
  const [dataState, setDataState] = useState("loading");
  const [isWorking, setIsWorking] = useState(false);
  const [activeTab, setActiveTab] = useState("order");
  const [openArchiveTenantId, setOpenArchiveTenantId] = useState(null);
  const [menuPreview, setMenuPreview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastArchivedTenant, setLastArchivedTenant] = useState(null);
  const dialogRef = useRef(null);
  const lastFocusedElementRef = useRef(null);

  const api = useCallback(async (method = "GET", body) => {
    const idToken = liff?.getIDToken();
    if (!idToken) throw new Error("Buka kembali aplikasi ini dari LINE lalu masuk lagi.");
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
    try { const data = await api(); setTenants(data.tenants || []); setViewerId(data.viewerId || ""); setError(""); }
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
          setNotice("You joined the order room. Add your order below.");
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
  const openTenant = (tenant = null) => { setEditingTenant(tenant); setTenantName(tenant?.name || ""); setTenantDescription(tenant?.description || ""); setTenantDeadline(localDateTimeValue(tenant?.ordering_deadline)); setTenantPickupNotes(tenant?.pickup_notes || ""); setTenantPaymentNotes(tenant?.payment_notes || ""); setModal("tenant"); };

  useEffect(() => {
    if (!modal && !menuPreview) return undefined;
    lastFocusedElementRef.current = document.activeElement;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusDialog = () => dialogRef.current?.querySelector("[autofocus], " + focusableSelector)?.focus();
    const timeout = window.setTimeout(focusDialog, 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") { if (menuPreview) setMenuPreview(null); else setModal(null); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timeout); document.removeEventListener("keydown", onKeyDown); lastFocusedElementRef.current?.focus?.(); };
  }, [modal, menuPreview]);

  const saveTenant = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      const details = { name: tenantName, description: tenantDescription, orderingDeadline: tenantDeadline || null, pickupNotes: tenantPickupNotes, paymentNotes: tenantPaymentNotes };
      await api("POST", editingTenant ? { action: "tenant.rename", tenantId: editingTenant.id, ...details } : { action: "tenant.create", ...details });
      setModal(null); setNotice(editingTenant ? "Order room updated." : "Order room created."); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const saveOrder = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      await api("POST", { action: "order.save", tenantId: activeTenant.id, order: { ...form, id: activeOrder?.id } });
      setModal(null); setNotice(activeOrder ? "Order updated." : `Order added to ${activeTenant.name}.`); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const deleteOrder = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.delete", tenantId: activeTenant.id, orderId: activeOrder.id }); setModal(null); setNotice("Order deleted."); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const deleteTenant = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "tenant.delete", tenantId: activeTenant.id }); setModal(null); setActiveTenant(null); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const inviteFriends = async (tenant) => {
    setIsWorking(true);
    try {
      const { token } = await api("POST", { action: "invite.create", tenantId: tenant.id });
      const liffId = process.env.LIFF_ID;
      if (!liffId) throw new Error("LIFF is not configured. Please contact the app owner.");
      const url = `https://liff.line.me/${liffId}?invite=${encodeURIComponent(token)}`;
      if (!liff?.isApiAvailable("shareTargetPicker")) throw new Error("Friend sharing is available only in a supported LINE app.");
      await liff.shareTargetPicker([{ type: "text", text: `Join my ${tenant.name} order group: ${url}` }], { isMultiple: true });
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const uploadMenu = async (event, tenant) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsWorking(true);
    try { await api("POST", { action: "menu.upload", tenantId: tenant.id, image: await compressMenuImage(file) }); setNotice("Menu updated."); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { event.target.value = ""; setIsWorking(false); }
  };

  const archiveOrders = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.archive", tenantId: activeTenant.id }); setModal(null); setLastArchivedTenant(activeTenant); setActiveTab("archive"); setNotice(`${activeTenant.name} is closed and has moved to History.`); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const shareCheckoutSummary = async (tenant) => {
    const itemCount = tenant.orders.reduce((total, order) => total + Number(order.quantity), 0);
    const total = tenant.orders.reduce((amount, order) => amount + orderTotal(order), 0);
    const itemLines = tenant.orders.map((order) => `• ${order.quantity}× ${order.menu} — ${formatCurrency(orderTotal(order))}`).join("\n");
    const details = [tenant.pickup_notes && `Pickup: ${tenant.pickup_notes}`, tenant.payment_notes && `Payment: ${tenant.payment_notes}`].filter(Boolean).join("\n");
    try {
      if (!liff?.isApiAvailable("shareTargetPicker")) throw new Error("Sharing is available only in a supported LINE app.");
      await liff.shareTargetPicker([{ type: "text", text: `Order summary: ${tenant.name}\n${itemCount} items · ${formatCurrency(total)}\n\n${itemLines}${details ? `\n\n${details}` : ""}` }], { isMultiple: true });
      setNotice("Order summary is ready to share in LINE.");
    } catch (requestError) { setError(requestError.message); }
  };

  const visibleTenants = tenants.filter((tenant) => activeTab === "archive" ? tenant.is_archived : !tenant.is_archived);

  return <>
    <Head>
      <title>Order Together</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta httpEquiv="content-language" content="en" /></Head>
    <Script src="https://www.googletagmanager.com/gtag/js?id=G-NLW42HR5NQ" strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-NLW42HR5NQ');
    `}</Script>
    <nav className="top-tabs" aria-label="Order navigation">
      <button className={activeTab === "order" ? "top-tab active" : "top-tab"} aria-current={activeTab === "order" ? "page" : undefined} onClick={() => setActiveTab("order")}>Active ({tenants.filter((tenant) => !tenant.is_archived).length})</button>
      <button className={activeTab === "archive" ? "top-tab active" : "top-tab"} aria-current={activeTab === "archive" ? "page" : undefined} onClick={() => setActiveTab("archive")}>History ({tenants.filter((tenant) => tenant.is_archived).length})</button>
    </nav>
    {isWorking && <div className="request-buffer" role="status" aria-live="polite"><div><span className="spinner" /><strong>Saving changes</strong><small>Please wait a moment…</small></div></div>}
    <main className="order-page"><div className="tenant-list">
      {liffError && <p className="liff-notice">LIFF connection unavailable: {liffError}</p>}
      {loginState === "loading" && !liffError && <p className="liff-notice">Checking LINE login…</p>}
      {error && <p className="app-error" role="alert">{error}</p>}
      {notice && <div className="app-notice" role="status"><span>{notice}</span><span className="notice-actions">{lastArchivedTenant && activeTab === "archive" && <button onClick={() => shareCheckoutSummary(lastArchivedTenant)}>Share to LINE</button>}<button onClick={() => setNotice("")}>Close</button></span></div>}
      {(dataState === "loading" || isWorking) && <div className="loading-state"><span className="spinner" /> <span>{isWorking ? "Saving changes…" : "Loading order rooms…"}</span></div>}
      {dataState === "ready" && !visibleTenants.length && <section className="empty-tab"><h1>{activeTab === "archive" ? "No history yet" : "No active orders"}</h1><p>{activeTab === "archive" ? "Closed order rooms will appear here." : "Create an order room, then invite friends to order together."}</p>{activeTab === "order" && <button className="empty-cta" onClick={() => openTenant()} disabled={loginState !== "ready"}>Create an order room</button>}</section>}
      {visibleTenants.map((tenant, index) => {
        if (tenant.is_archived) {
          const latestArchive = tenant.archives?.[0];
          return <details className="order-card archive-tenant-card" key={tenant.id} open={openArchiveTenantId === tenant.id} onToggle={(event) => setOpenArchiveTenantId(event.currentTarget.open ? tenant.id : null)}>
            <summary className="order-header archive-tenant-summary"><div><p className="eyebrow">CLOSED</p><div className="tenant-title"><h1>{tenant.name}</h1></div><p className="subtitle">{tenant.description || "View the completed order summary."}</p>{latestArchive && <p className="archive-summary">{latestArchive.total_items} items · {formatCurrency(latestArchive.total_amount)}</p>}</div><span className="archive-toggle-label">Show</span></summary>
            <section className="archive-section"><p className="eyebrow">ORDER HISTORY</p>{tenant.archives?.map((archive) => <article className="archive-record" key={archive.id}><div className="archive-record-heading"><span>{new Date(archive.archived_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</span><span>{archive.total_items} items · {formatCurrency(archive.total_amount)}</span></div><ul>{archive.orders.map((order) => <li key={order.id}>{order.quantity}× {order.menu} <span>{order.ordered_by_name}</span></li>)}</ul></article>)}</section>
          </details>;
        }

        const itemCount = tenant.orders.reduce((total, order) => total + Number(order.quantity), 0);
        const groupTotal = tenant.orders.reduce((total, order) => total + orderTotal(order), 0);
        const myTotal = tenant.orders.filter((order) => order.ordered_by_line_user_id === viewerId).reduce((total, order) => total + orderTotal(order), 0);
        const status = orderStatus(tenant.ordering_deadline);
        const orderingClosed = status.className === "closed";
        return <section className="order-card" key={tenant.id}>
          <header className="order-header"><div><p className={`eyebrow room-status ${status.className}`}>ORDER ROOM {index + 1} · {status.label}</p><div className="tenant-title"><h1>{tenant.name}</h1>{tenant.role === "owner" && <button className="edit-tenant" aria-label={`Edit ${tenant.name} order room`} onClick={() => openTenant(tenant)}>Edit</button>}</div><p className="subtitle">{tenant.description || (orderingClosed ? "The ordering deadline has passed." : "Add your order before this room closes.")}</p></div><div className="order-count"><strong>{itemCount}</strong><span>items</span></div></header>
          <section className="order-summary" aria-label={`${tenant.name} summary`}><div><span>Group total</span><strong>{formatCurrency(groupTotal)}</strong></div><div><span>My order</span><strong>{formatCurrency(myTotal)}</strong></div><div><span>People</span><strong>{new Set(tenant.orders.map((order) => order.ordered_by_line_user_id)).size}</strong></div></section>
          <section className="coordination-details" aria-label={`${tenant.name} coordination details`}><div><span>Order deadline</span><strong>{formatDeadline(tenant.ordering_deadline)}</strong></div>{tenant.pickup_notes && <div><span>Pickup</span><strong>{tenant.pickup_notes}</strong></div>}{tenant.payment_notes && <div><span>Payment</span><strong>{tenant.payment_notes}</strong></div>}</section>
          {tenant.role === "owner" && <div className="tenant-tools"><button className="invite-button" onClick={() => inviteFriends(tenant)}>Invite friends</button><label className="menu-upload"><input type="file" accept="image/*" onChange={(event) => uploadMenu(event, tenant)} />{tenant.menuImageUrl ? "Replace menu" : "Upload menu"}</label><button className="finish-button" disabled={!tenant.orders.length} onClick={() => { setActiveTenant(tenant); setModal("archive"); }}>Close order</button></div>}
          <section className="menu-section"><div><p className="eyebrow">MERCHANT MENU</p><p>{tenant.menuImageUrl ? "Tap the image to view the full menu." : tenant.role === "owner" ? "Upload one menu image so friends can see the options." : "The room owner has not uploaded a menu yet."}</p></div>{tenant.menuImageUrl && <button type="button" className="menu-preview" onClick={() => setMenuPreview({ url: tenant.menuImageUrl, name: tenant.name })} aria-label={`View ${tenant.name} menu`}><img src={tenant.menuImageUrl} alt={`${tenant.name} menu`} /></button>}</section>
          <div className="table-wrap"><table><thead><tr><th>No.</th><th>Menu</th><th>Quantity</th><th>Ordered by</th><th>Notes</th><th>Total</th><th aria-label="Actions" /></tr></thead><tbody>{tenant.orders.length ? tenant.orders.map((order, orderIndex) => {
            const isMine = order.ordered_by_line_user_id === viewerId;
            const canModify = tenant.role === "owner" || isMine;
            return <tr key={order.id} className={isMine ? "my-order" : ""}><td data-label="No.">{String(orderIndex + 1).padStart(2, "0")}</td><td data-label="Menu" className="menu-name">{order.menu}{isMine && <span className="my-order-label">My order</span>}</td><td data-label="Quantity"><span className="quantity">{order.quantity}</span></td><td data-label="Ordered by">{order.ordered_by_name}</td><td data-label="Notes" className="notes">{order.notes || "—"}</td><td data-label="Total" className="line-total">{formatCurrency(orderTotal(order))}</td><td className="actions">{canModify && <><button aria-label={`Edit ${order.menu} order`} onClick={() => openOrder(tenant, order)}>Edit</button><button className="delete-link" aria-label={`Delete ${order.menu} order`} onClick={() => { setActiveTenant(tenant); setActiveOrder(order); setModal("delete"); }}>Delete</button></>}</td></tr>;
          }) : <tr><td className="empty-orders" colSpan="7">No orders yet. Be the first to add one.</td></tr>}</tbody></table></div>
          <button className="add-button" onClick={() => openOrder(tenant)} disabled={loginState !== "ready" || orderingClosed}><span>＋</span>{orderingClosed ? "The ordering deadline has passed" : "Add order"}</button>{tenant.role === "owner" && <button className="delete-tenant-button" onClick={() => { setActiveTenant(tenant); setModal("deleteTenant"); }}>Delete order room</button>}
        </section>;
      })}
      {activeTab === "order" && visibleTenants.length > 0 && <button className="add-tenant-button" onClick={() => openTenant()} disabled={loginState !== "ready"}><span>＋</span> Create order room</button>}
    </div></main>
    {modal === "tenant" && <div className="modal-backdrop"><form ref={dialogRef} className="modal tenant-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-dialog-title" onSubmit={saveTenant}><div className="modal-heading"><p className="eyebrow">{editingTenant ? "EDIT ROOM" : "NEW ROOM"}</p><h2 id="tenant-dialog-title">{editingTenant ? "Edit order room" : "Create an order room"}</h2></div><label>Merchant / restaurant name<input autoFocus required value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="e.g. Chatime" /></label><label>Note for participants <small>(optional)</small><textarea value={tenantDescription} onChange={(event) => setTenantDescription(event.target.value)} placeholder="e.g. Please order before noon" rows="3" /></label><label>Ordering deadline <small>(optional)</small><input type="datetime-local" value={tenantDeadline} onChange={(event) => setTenantDeadline(event.target.value)} /></label><label>Pickup instructions <small>(optional)</small><textarea value={tenantPickupNotes} onChange={(event) => setTenantPickupNotes(event.target.value)} placeholder="e.g. Pick up at the lobby at 12:30 PM" rows="2" /></label><label>Payment instructions <small>(optional)</small><textarea value={tenantPaymentNotes} onChange={(event) => setTenantPaymentNotes(event.target.value)} placeholder="e.g. Transfer to BCA 123456789" rows="2" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="tenant-submit-button">{editingTenant ? "Save" : "Create room"}</button></div></form></div>}
    {modal === "order" && <div className="modal-backdrop"><form ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" onSubmit={saveOrder}><div className="modal-heading"><p className="eyebrow">{activeOrder ? "EDIT ORDER" : "NEW ORDER"}</p><h2 id="order-dialog-title">{activeOrder ? "Edit your order" : `Add an order to ${activeTenant?.name}`}</h2></div><div className="profile-summary"><span>Ordering as</span><strong>{profileName}</strong></div>{activeTenant?.menuImageUrl && <button type="button" className="view-menu-link" onClick={() => setMenuPreview({ url: activeTenant.menuImageUrl, name: activeTenant.name })}>View {activeTenant.name} menu</button>}<label>Menu<input autoFocus required name="menu" value={form.menu} onChange={updateField} placeholder="e.g. Brown Sugar Boba Milk" /></label><div className="form-grid"><label>Quantity<input required min="1" inputMode="numeric" type="number" name="quantity" value={form.quantity} onChange={updateField} /></label><label>Unit price (Rp) <small>optional</small><input min="0" inputMode="numeric" type="number" name="price" value={form.price} onChange={updateField} placeholder="25000" /></label></div><p className="form-total">Order total <strong>{formatCurrency(orderTotal(form))}</strong></p><label>Notes <small>(optional)</small><textarea name="notes" value={form.notes || ""} onChange={updateField} placeholder="e.g. less ice, 50% sugar" rows="3" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary-button">{activeOrder ? "Save changes" : "Add order"}</button></div></form></div>}
    {modal === "delete" && <div className="modal-backdrop"><section ref={dialogRef} className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-order-title"><div className="warning-icon">!</div><p className="eyebrow">DELETE ORDER</p><h2 id="delete-order-title">Delete this order?</h2><p>This order will be removed from the list and cannot be restored.</p><div className="modal-actions"><button autoFocus className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" onClick={deleteOrder}>Delete</button></div></section></div>}
    {modal === "deleteTenant" && <div className="modal-backdrop"><section ref={dialogRef} className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-room-title"><div className="warning-icon">!</div><p className="eyebrow">DELETE ROOM</p><h2 id="delete-room-title">Delete {activeTenant?.name}?</h2><p>The room, its active orders, and its history will be permanently deleted.</p><div className="modal-actions"><button autoFocus className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="danger-button" onClick={deleteTenant}>Delete room</button></div></section></div>}
    {modal === "archive" && <div className="modal-backdrop"><section ref={dialogRef} className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title"><div className="warning-icon">✓</div><p className="eyebrow">CLOSE ORDER</p><h2 id="archive-dialog-title">Close {activeTenant?.name}?</h2><div className="archive-confirm-summary"><span>{activeTenant?.orders.reduce((total, order) => total + Number(order.quantity), 0)} items</span><strong>{formatCurrency(activeTenant?.orders.reduce((total, order) => total + orderTotal(order), 0))}</strong></div><p>The orders will be saved to History. Participants will no longer be able to add or edit orders.</p><div className="modal-actions"><button autoFocus className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" onClick={archiveOrders}>Close & archive</button></div></section></div>}
    {menuPreview && <div ref={dialogRef} className="modal-backdrop menu-preview-backdrop" role="dialog" aria-modal="true" aria-label={`${menuPreview.name} menu preview`} onClick={() => setMenuPreview(null)}><button type="button" className="menu-preview-close" onClick={() => setMenuPreview(null)} aria-label="Close menu preview">×</button><img className="menu-preview-full" src={menuPreview.url} alt={`${menuPreview.name} menu`} onClick={(event) => event.stopPropagation()} /></div>}
  </>;
}
