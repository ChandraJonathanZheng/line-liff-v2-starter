/* eslint-disable @next/next/no-img-element -- Supabase signed URLs are dynamic and short-lived. */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";

const emptyOrder = { menu: "", quantity: 1, price: "", notes: "" };
const formatAmount = (amount) => Number(amount || 0).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatCurrency = (amount) => `Rp${formatAmount(amount)}`;
const orderTotal = (order) => Number(order.quantity || 0) * Number(order.price || 0);

async function compressMenuImage(file) {
  if (!file?.type.startsWith("image/")) throw new Error("Pilih file gambar terlebih dahulu.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("Gambar tidak dapat dibuka.")); element.src = sourceUrl; });
    const scale = Math.min(1, 1600 / image.width, 1600 / image.height);
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Kompresi gambar gagal."));
      if (blob.size > 1_500_000) return reject(new Error("Ukuran gambar masih lebih dari 1,5 MB. Pilih gambar yang lebih kecil."));
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Kompresi gambar gagal.")); reader.readAsDataURL(blob);
    }, "image/webp", 0.78));
  } finally { URL.revokeObjectURL(sourceUrl); }
}

export default function Home({ liff, liffError }) {
  const [tenants, setTenants] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [tenantName, setTenantName] = useState("");
  const [tenantDescription, setTenantDescription] = useState("");
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

  const api = useCallback(async (method = "GET", body) => {
    const idToken = liff?.getIDToken();
    if (!idToken) throw new Error("Buka kembali aplikasi ini dari LINE lalu masuk lagi.");
    const response = await fetch("/api/app", {
      method,
      headers: { Authorization: `Bearer ${idToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Permintaan gagal.");
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
          setNotice("Kamu sudah bergabung ke room pesanan. Tambahkan pesananmu di bawah.");
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
  const openTenant = (tenant = null) => { setEditingTenant(tenant); setTenantName(tenant?.name || ""); setTenantDescription(tenant?.description || ""); setModal("tenant"); };

  const saveTenant = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      await api("POST", editingTenant ? { action: "tenant.rename", tenantId: editingTenant.id, name: tenantName, description: tenantDescription } : { action: "tenant.create", name: tenantName, description: tenantDescription });
      setModal(null); setNotice(editingTenant ? "Room pesanan diperbarui." : "Room pesanan berhasil dibuat."); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const saveOrder = async (event) => {
    event.preventDefault();
    setIsWorking(true);
    try {
      await api("POST", { action: "order.save", tenantId: activeTenant.id, order: { ...form, id: activeOrder?.id } });
      setModal(null); setNotice(activeOrder ? "Pesanan diperbarui." : `Pesanan ditambahkan ke ${activeTenant.name}.`); await loadTenants();
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const deleteOrder = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.delete", tenantId: activeTenant.id, orderId: activeOrder.id }); setModal(null); setNotice("Pesanan dihapus."); await loadTenants(); }
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
      if (!liffId) throw new Error("LIFF belum dikonfigurasi. Hubungi pemilik aplikasi.");
      const url = `https://liff.line.me/${liffId}?invite=${encodeURIComponent(token)}`;
      if (!liff?.isApiAvailable("shareTargetPicker")) throw new Error("Fitur undang teman hanya tersedia di aplikasi LINE yang didukung.");
      await liff.shareTargetPicker([{ type: "text", text: `Yuk gabung pesanan ${tenant.name}: ${url}` }], { isMultiple: true });
    } catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const uploadMenu = async (event, tenant) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsWorking(true);
    try { await api("POST", { action: "menu.upload", tenantId: tenant.id, image: await compressMenuImage(file) }); setNotice("Menu berhasil diperbarui."); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { event.target.value = ""; setIsWorking(false); }
  };

  const archiveOrders = async () => {
    setIsWorking(true);
    try { await api("POST", { action: "order.archive", tenantId: activeTenant.id }); setModal(null); setActiveTab("archive"); setNotice(`${activeTenant.name} telah ditutup dan dipindahkan ke Riwayat.`); await loadTenants(); }
    catch (requestError) { setError(requestError.message); } finally { setIsWorking(false); }
  };

  const visibleTenants = tenants.filter((tenant) => activeTab === "archive" ? tenant.is_archived : !tenant.is_archived);

  return <>
    <Head><title>一起點餐 · Pesan Bersama</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta httpEquiv="content-language" content="id" /></Head>
    <nav className="top-tabs" aria-label="Navigasi pesanan">
      <button className={activeTab === "order" ? "top-tab active" : "top-tab"} aria-current={activeTab === "order" ? "page" : undefined} onClick={() => setActiveTab("order")}>Aktif ({tenants.filter((tenant) => !tenant.is_archived).length})</button>
      <button className={activeTab === "archive" ? "top-tab active" : "top-tab"} aria-current={activeTab === "archive" ? "page" : undefined} onClick={() => setActiveTab("archive")}>Riwayat ({tenants.filter((tenant) => tenant.is_archived).length})</button>
    </nav>
    {isWorking && <div className="request-buffer" role="status" aria-live="polite"><div><span className="spinner" /><strong>Menyimpan perubahan</strong><small>Mohon tunggu sebentar…</small></div></div>}
    <main className="order-page"><div className="tenant-list">
      {liffError && <p className="liff-notice">Koneksi LIFF tidak tersedia: {liffError}</p>}
      {loginState === "loading" && !liffError && <p className="liff-notice">Memeriksa login LINE…</p>}
      {error && <p className="app-error" role="alert">{error}</p>}
      {notice && <div className="app-notice" role="status"><span>{notice}</span>{activeTab === "archive" && <button onClick={() => setNotice("")}>Tutup</button>}</div>}
      {(dataState === "loading" || isWorking) && <div className="loading-state"><span className="spinner" /> <span>{isWorking ? "Menyimpan perubahan…" : "Memuat room pesanan…"}</span></div>}
      {dataState === "ready" && !visibleTenants.length && <section className="empty-tab"><h1>{activeTab === "archive" ? "Belum ada riwayat" : "Belum ada pesanan aktif"}</h1><p>{activeTab === "archive" ? "Room yang sudah ditutup akan muncul di sini." : "Buat room pesanan, lalu undang teman untuk mulai pesan bersama."}</p>{activeTab === "order" && <button className="empty-cta" onClick={() => openTenant()} disabled={loginState !== "ready"}>Buat room pesanan</button>}</section>}
      {visibleTenants.map((tenant, index) => {
        if (tenant.is_archived) {
          const latestArchive = tenant.archives?.[0];
          return <details className="order-card archive-tenant-card" key={tenant.id} open={openArchiveTenantId === tenant.id} onToggle={(event) => setOpenArchiveTenantId(event.currentTarget.open ? tenant.id : null)}>
            <summary className="order-header archive-tenant-summary"><div><p className="eyebrow">DITUTUP</p><div className="tenant-title"><h1>{tenant.name}</h1></div><p className="subtitle">{tenant.description || "Lihat ringkasan pesanan yang telah selesai."}</p>{latestArchive && <p className="archive-summary">{latestArchive.total_items} item · {formatCurrency(latestArchive.total_amount)}</p>}</div><span className="archive-toggle-label">Tampilkan</span></summary>
            <section className="archive-section"><p className="eyebrow">RIWAYAT PESANAN</p>{tenant.archives?.map((archive) => <article className="archive-record" key={archive.id}><div className="archive-record-heading"><span>{new Date(archive.archived_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}</span><span>{archive.total_items} item · {formatCurrency(archive.total_amount)}</span></div><ul>{archive.orders.map((order) => <li key={order.id}>{order.quantity}× {order.menu} <span>{order.ordered_by_name}</span></li>)}</ul></article>)}</section>
          </details>;
        }

        const itemCount = tenant.orders.reduce((total, order) => total + Number(order.quantity), 0);
        const groupTotal = tenant.orders.reduce((total, order) => total + orderTotal(order), 0);
        const myTotal = tenant.orders.filter((order) => order.ordered_by_line_user_id === viewerId).reduce((total, order) => total + orderTotal(order), 0);
        return <section className="order-card" key={tenant.id}>
          <header className="order-header"><div><p className="eyebrow">ROOM PESANAN {index + 1} · DIBUKA</p><div className="tenant-title"><h1>{tenant.name}</h1>{tenant.role === "owner" && <button className="edit-tenant" aria-label={`Ubah room ${tenant.name}`} onClick={() => openTenant(tenant)}>Ubah</button>}</div><p className="subtitle">{tenant.description || "Tambahkan pesananmu sebelum room ditutup."}</p></div><div className="order-count"><strong>{itemCount}</strong><span>item</span></div></header>
          <section className="order-summary" aria-label={`Ringkasan ${tenant.name}`}><div><span>Total grup</span><strong>{formatCurrency(groupTotal)}</strong></div><div><span>Pesanan saya</span><strong>{formatCurrency(myTotal)}</strong></div><div><span>Pemesan</span><strong>{new Set(tenant.orders.map((order) => order.ordered_by_line_user_id)).size} orang</strong></div></section>
          {tenant.role === "owner" && <div className="tenant-tools"><button className="invite-button" onClick={() => inviteFriends(tenant)}>Undang teman</button><label className="menu-upload"><input type="file" accept="image/*" onChange={(event) => uploadMenu(event, tenant)} />{tenant.menuImageUrl ? "Ganti menu" : "Unggah menu"}</label><button className="finish-button" disabled={!tenant.orders.length} onClick={() => { setActiveTenant(tenant); setModal("archive"); }}>Tutup pesanan</button></div>}
          <section className="menu-section"><div><p className="eyebrow">MENU MERCHANT</p><p>{tenant.menuImageUrl ? "Ketuk gambar untuk melihat menu ukuran penuh." : tenant.role === "owner" ? "Unggah satu gambar menu agar teman dapat melihat pilihan." : "Pemilik room belum mengunggah menu."}</p></div>{tenant.menuImageUrl && <button type="button" className="menu-preview" onClick={() => setMenuPreview({ url: tenant.menuImageUrl, name: tenant.name })} aria-label={`Lihat menu ${tenant.name}`}><img src={tenant.menuImageUrl} alt={`Menu ${tenant.name}`} /></button>}</section>
          <div className="table-wrap"><table><thead><tr><th>No.</th><th>Menu</th><th>Jumlah</th><th>Pemesan</th><th>Catatan</th><th>Total</th><th aria-label="Aksi" /></tr></thead><tbody>{tenant.orders.length ? tenant.orders.map((order, orderIndex) => {
            const isMine = order.ordered_by_line_user_id === viewerId;
            const canModify = tenant.role === "owner" || isMine;
            return <tr key={order.id} className={isMine ? "my-order" : ""}><td data-label="No.">{String(orderIndex + 1).padStart(2, "0")}</td><td data-label="Menu" className="menu-name">{order.menu}{isMine && <span className="my-order-label">Pesanan saya</span>}</td><td data-label="Jumlah"><span className="quantity">{order.quantity}</span></td><td data-label="Pemesan">{order.ordered_by_name}</td><td data-label="Catatan" className="notes">{order.notes || "—"}</td><td data-label="Total" className="line-total">{formatCurrency(orderTotal(order))}</td><td className="actions">{canModify && <><button aria-label={`Ubah pesanan ${order.menu}`} onClick={() => openOrder(tenant, order)}>Ubah</button><button className="delete-link" aria-label={`Hapus pesanan ${order.menu}`} onClick={() => { setActiveTenant(tenant); setActiveOrder(order); setModal("delete"); }}>Hapus</button></>}</td></tr>;
          }) : <tr><td className="empty-orders" colSpan="7">Belum ada pesanan. Jadilah yang pertama menambahkan pesanan.</td></tr>}</tbody></table></div>
          <button className="add-button" onClick={() => openOrder(tenant)} disabled={loginState !== "ready"}><span>＋</span>Tambah pesanan</button>{tenant.role === "owner" && <button className="delete-tenant-button" onClick={() => { setActiveTenant(tenant); setModal("deleteTenant"); }}>Hapus room pesanan</button>}
        </section>;
      })}
      {activeTab === "order" && visibleTenants.length > 0 && <button className="add-tenant-button" onClick={() => openTenant()} disabled={loginState !== "ready"}><span>＋</span> Buat room pesanan</button>}
    </div></main>
    {modal === "tenant" && <div className="modal-backdrop"><form className="modal tenant-modal" onSubmit={saveTenant}><div className="modal-heading"><p className="eyebrow">{editingTenant ? "UBAH ROOM" : "ROOM BARU"}</p><h2>{editingTenant ? "Ubah room pesanan" : "Buat room pesanan"}</h2></div><label>Nama merchant / tempat makan<input autoFocus required value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="contoh: Chatime" /></label><label>Catatan untuk peserta <small>(opsional)</small><textarea value={tenantDescription} onChange={(event) => setTenantDescription(event.target.value)} placeholder="contoh: Pesan sebelum pukul 12.00" rows="3" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Batal</button><button type="submit" className="tenant-submit-button">{editingTenant ? "Simpan" : "Buat room"}</button></div></form></div>}
    {modal === "order" && <div className="modal-backdrop"><form className="modal" onSubmit={saveOrder}><div className="modal-heading"><p className="eyebrow">{activeOrder ? "UBAH PESANAN" : "PESANAN BARU"}</p><h2>{activeOrder ? "Ubah pesananmu" : `Tambah pesanan di ${activeTenant?.name}`}</h2></div><div className="profile-summary"><span>Memesan sebagai</span><strong>{profileName}</strong></div>{activeTenant?.menuImageUrl && <button type="button" className="view-menu-link" onClick={() => setMenuPreview({ url: activeTenant.menuImageUrl, name: activeTenant.name })}>Lihat menu {activeTenant.name}</button>}<label>Menu<input autoFocus required name="menu" value={form.menu} onChange={updateField} placeholder="contoh: Brown Sugar Boba Milk" /></label><div className="form-grid"><label>Jumlah<input required min="1" inputMode="numeric" type="number" name="quantity" value={form.quantity} onChange={updateField} /></label><label>Harga satuan (Rp) <small>opsional</small><input min="0" inputMode="numeric" type="number" name="price" value={form.price} onChange={updateField} placeholder="25000" /></label></div><p className="form-total">Total pesanan ini <strong>{formatCurrency(orderTotal(form))}</strong></p><label>Catatan <small>(opsional)</small><textarea name="notes" value={form.notes || ""} onChange={updateField} placeholder="contoh: kurang es, 50% gula" rows="3" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Batal</button><button type="submit" className="primary-button">{activeOrder ? "Simpan perubahan" : "Tambahkan pesanan"}</button></div></form></div>}
    {modal === "delete" && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-icon">!</div><p className="eyebrow">HAPUS PESANAN</p><h2>Hapus pesanan ini?</h2><p>Pesanan akan dihapus dari daftar dan tidak dapat dikembalikan.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Batal</button><button className="danger-button" onClick={deleteOrder}>Hapus</button></div></section></div>}
    {modal === "deleteTenant" && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-icon">!</div><p className="eyebrow">HAPUS ROOM</p><h2>Hapus {activeTenant?.name}?</h2><p>Room, pesanan aktif, dan riwayatnya akan dihapus permanen.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Batal</button><button className="danger-button" onClick={deleteTenant}>Hapus room</button></div></section></div>}
    {modal === "archive" && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-icon">✓</div><p className="eyebrow">TUTUP PESANAN</p><h2>Tutup pesanan {activeTenant?.name}?</h2><div className="archive-confirm-summary"><span>{activeTenant?.orders.reduce((total, order) => total + Number(order.quantity), 0)} item</span><strong>{formatCurrency(activeTenant?.orders.reduce((total, order) => total + orderTotal(order), 0))}</strong></div><p>Pesanan akan disimpan ke Riwayat. Peserta tidak dapat menambah atau mengubah pesanan setelah ini.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Batal</button><button className="primary-button" onClick={archiveOrders}>Tutup & arsipkan</button></div></section></div>}
    {menuPreview && <div className="modal-backdrop menu-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Pratinjau menu ${menuPreview.name}`} onClick={() => setMenuPreview(null)}><button type="button" className="menu-preview-close" onClick={() => setMenuPreview(null)} aria-label="Tutup pratinjau menu">×</button><img className="menu-preview-full" src={menuPreview.url} alt={`Menu ${menuPreview.name}`} onClick={(event) => event.stopPropagation()} /></div>}
  </>;
}
