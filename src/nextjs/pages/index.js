import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

const initialOrders = [
  {
    id: 1,
    name: "Chandra",
    menu: "珍珠奶茶",
    quantity: 1,
    price: 65,
    notes: "微糖微冰",
  },
];

const emptyOrder = { name: "", menu: "", quantity: 1, price: "", notes: "" };

export default function Home({ liff, liffError }) {
  const [orders, setOrders] = useState(initialOrders);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [activeOrder, setActiveOrder] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [loginState, setLoginState] = useState("loading");

  useEffect(() => {
    if (!liff) return;

    // LIFF manages the JWT access token. A missing session is redirected to LINE login.
    if (!liff.isLoggedIn() || !liff.getAccessToken()) {
      liff.login();
      return;
    }

    setLoginState("ready");
    liff
      .getProfile()
      .then((profile) => setProfileName(profile.displayName || "LINE User"))
      .catch(() => setProfileName("LINE User"));
  }, [liff]);

  const totalItems = useMemo(
    () => orders.reduce((total, order) => total + Number(order.quantity), 0),
    [orders]
  );

  const openAdd = () => {
    setActiveOrder(null);
    setForm({ ...emptyOrder, name: profileName });
    setModal("form");
  };

  const openEdit = (order) => {
    setActiveOrder(order);
    setForm({ ...order });
    setModal("form");
  };

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const saveOrder = (event) => {
    event.preventDefault();
    const order = {
      ...form,
      quantity: Math.max(1, Number(form.quantity) || 1),
      price: Number(form.price) || 0,
    };

    if (activeOrder) {
      setOrders((current) => current.map((item) => (item.id === activeOrder.id ? { ...order, id: item.id } : item)));
    } else {
      setOrders((current) => [...current, { ...order, id: Date.now() }]);
    }
    setModal(null);
  };

  const deleteOrder = () => {
    setOrders((current) => current.filter((item) => item.id !== activeOrder.id));
    setActiveOrder(null);
    setModal(null);
  };

  return (
    <>
      <Head>
        <title>一起點餐 · Order Together</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="order-page">
        <section className="order-card">
          <header className="order-header">
            <div>
              <p className="eyebrow">GROUP ORDER</p>
              <h1>得正</h1>
              <p className="subtitle">一起接龍點餐，輕鬆總結每一份i心意.</p>
            </div>
            <div className="order-count"><strong>{totalItems}</strong><span>items</span></div>
          </header>

          {liffError && <p className="liff-notice">LIFF connection unavailable: {liffError}</p>}
          {loginState === "loading" && !liffError && <p className="liff-notice">Checking LINE login…</p>}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Index</th><th>Menu</th><th>Quantity</th><th>Who order</th><th>Notes</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={order.id}>
                    <td data-label="Index">{String(index + 1).padStart(2, "0")}</td>
                    <td data-label="Menu" className="menu-name">{order.menu}</td>
                    <td data-label="Quantity"><span className="quantity">{order.quantity}</span></td>
                    <td data-label="Who order">{order.name}</td>
                    <td data-label="Notes" className="notes">{order.notes || "—"}</td>
                    <td className="actions"><button onClick={() => openEdit(order)}>Edit</button><button className="delete-link" onClick={() => { setActiveOrder(order); setModal("delete"); }}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="add-button" onClick={openAdd} disabled={loginState !== "ready"}><span>＋</span> {loginState === "ready" ? "Add order" : "Preparing your profile…"}</button>
        </section>
      </main>

      {modal === "form" && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveOrder}>
            <div className="modal-heading"><p className="eyebrow">{activeOrder ? "UPDATE ORDER" : "NEW ORDER"}</p><h2>{activeOrder ? "Edit your order" : "Add an order"}</h2></div>
            <div className="profile-summary"><span>Ordering as</span><strong>{form.name || profileName}</strong></div>
            <label>Menu<input required name="menu" value={form.menu} onChange={updateField} placeholder="e.g. 珍珠奶茶" /></label>
            <div className="form-grid"><label>Quantity<input required min="1" type="number" name="quantity" value={form.quantity} onChange={updateField} /></label><label>Price<input min="0" type="number" name="price" value={form.price} onChange={updateField} placeholder="65" /></label></div>
            <label>Notes<textarea name="notes" value={form.notes} onChange={updateField} placeholder="e.g. 微糖微冰" rows="3" /></label>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="primary-button">{activeOrder ? "Save" : "Add"}</button></div>
          </form>
        </div>
      )}

      {modal === "delete" && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="warning-icon">!</div><p className="eyebrow">REMOVE ORDER</p><h2 id="delete-title">You sure?</h2><p>This order will be removed from the list.</p>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>No</button><button className="danger-button" onClick={deleteOrder}>YES</button></div>
          </section>
        </div>
      )}
    </>
  );
}
