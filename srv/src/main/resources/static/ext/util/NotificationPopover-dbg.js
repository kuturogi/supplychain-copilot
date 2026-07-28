sap.ui.define(["sap/m/Popover", "sap/m/Button", "sap/m/Bar", "sap/m/VBox", "sap/m/HBox", "sap/m/Text", "sap/ui/core/Icon", "sap/m/ScrollContainer", "sap/m/MessageToast"], function (Popover, Button, Bar, VBox, HBox, Text, Icon, ScrollContainer, MessageToast) {
  "use strict";

  const SEV_ICON = {
    "Kritik": "sap-icon://alert",
    "Uyarı": "sap-icon://warning2",
    "Bilgi": "sap-icon://information"
  };
  const SEV_COLOR = {
    "Kritik": "#bb0000",
    "Uyarı": "#e76500",
    "Bilgi": "#0064d9"
  };
  let _popover = null;
  let _badgeEl = null;

  // ─── Badge güncelleme ─────────────────────────────────────────────────────────

  function updateBadge(count) {
    if (_badgeEl) {
      _badgeEl.textContent = count > 0 ? String(Math.min(count, 99)) : "";
      _badgeEl.style.display = count > 0 ? "flex" : "none";
    }
  }

  // ─── Tarih formatlama ─────────────────────────────────────────────────────────

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Az önce";
      if (diffMins < 60) return `${diffMins} dk önce`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} sa önce`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} gün önce`;
      return d.toLocaleDateString("tr-TR");
    } catch {
      return "";
    }
  }

  // ─── Popover içeriğini güncelle ───────────────────────────────────────────────

  function renderItems(container, notifications, model) {
    container.destroyItems();
    if (notifications.length === 0) {
      container.addItem(new VBox({
        items: [new Icon({
          src: "sap-icon://accept",
          size: "2.5rem"
        }).addStyleClass("stNotifEmptyIcon"), new Text({
          text: "Yeni bildirim yok"
        }).addStyleClass("stNotifEmptyText")]
      }).addStyleClass("stNotifEmpty"));
      return;
    }
    notifications.forEach(n => {
      const color = SEV_COLOR[n.severity] ?? "#0064d9";
      const icon = SEV_ICON[n.severity] ?? "sap-icon://information";
      const msgText = new Text({
        text: n.message,
        wrapping: true
      }).addStyleClass("stNotifMsg");
      const metaText = new Text({
        text: `${n.severity}  •  ${formatDate(n.createdAt)}`
      }).addStyleClass("stNotifMeta");
      const leftIcon = new Icon({
        src: icon,
        color
      }).addStyleClass("stNotifSevIcon");
      const textBox = new VBox({
        items: [msgText, metaText],
        renderType: "Bare"
      }).addStyleClass("stNotifTextBox");
      const row = new HBox({
        items: [leftIcon, textBox],
        renderType: "Bare"
      }).addStyleClass(n.isRead ? "stNotifRow stNotifRow--read" : "stNotifRow stNotifRow--unread");

      // Satıra tıklayınca okundu işaretle
      row.attachBrowserEvent("click", async () => {
        if (n.isRead) return;
        try {
          const binding = model.bindContext("/markNotificationRead(...)");
          binding.setParameter("notificationId", n.ID);
          await binding.execute();
          n.isRead = true;
          row.removeStyleClass("stNotifRow--unread");
          row.addStyleClass("stNotifRow--read");
          const unread = notifications.filter(x => !x.isRead).length;
          updateBadge(unread);
        } catch (e) {
          console.error("Bildirim okundu işaretlenemedi:", e);
        }
      });
      container.addItem(row);
    });
  }

  // ─── Ana Popover aç ──────────────────────────────────────────────────────────

  async function openNotificationPopover(opener, model) {
    if (_popover && _popover.isOpen()) {
      _popover.close();
      return;
    }

    // Veriyi çek
    let notifications = [];
    try {
      const listBinding = model.bindList("/Notifications");
      const contexts = await listBinding.requestContexts(0, 50);
      notifications = contexts.map(c => c.getObject()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
      console.error("Bildirimler yüklenemedi:", e);
    }
    const itemsContainer = new VBox({
      renderType: "Bare"
    }).addStyleClass("stNotifItemsContainer");
    renderItems(itemsContainer, notifications, model);
    const scrollArea = new ScrollContainer({
      vertical: true,
      horizontal: false,
      height: "22rem",
      content: [itemsContainer]
    });
    const unreadCount = notifications.filter(n => !n.isRead).length;
    const markAllBtn = new Button({
      text: "Tümünü Okundu İşaretle",
      icon: "sap-icon://accept",
      enabled: unreadCount > 0,
      press: async () => {
        try {
          const binding = model.bindContext("/markAllNotificationsRead(...)");
          await binding.execute();
          notifications.forEach(n => {
            n.isRead = true;
          });
          renderItems(itemsContainer, notifications, model);
          markAllBtn.setEnabled(false);
          updateBadge(0);
          MessageToast.show("Tüm bildirimler okundu olarak işaretlendi");
        } catch (e) {
          console.error("Toplu okundu hatası:", e);
        }
      }
    }).addStyleClass("stNotifMarkAllBtn");
    _popover = new Popover({
      title: `Bildirimler${unreadCount > 0 ? ` (${unreadCount} yeni)` : ""}`,
      contentWidth: "22rem",
      placement: "Bottom",
      showHeader: true,
      content: [scrollArea],
      footer: new Bar({
        contentRight: [markAllBtn]
      }),
      afterClose: () => {
        _popover?.destroy();
        _popover = null;
      }
    }).addStyleClass("stNotifPopover");
    if (opener instanceof Button) {
      _popover.openBy(opener);
    } else {
      // HTMLElement ise UI5 çözdüğünden Control üzerinden aç
      _popover.openBy(opener);
    }
  }

  // ─── Shell Header'a bildirim ikonu enjekte et ────────────────────────────────

  function injectNotificationButton(model) {
    // UI5 render döngüsü bitmeden önce yapısal DOM hazır olmayabilir; kısa bekle
    setTimeout(async () => {
      if (document.getElementById("stNotifBtn")) return;

      // Okunmamış sayıyı önceden çek
      let unreadCount = 0;
      try {
        const fnBinding = model.bindContext("/getUnreadNotificationCount(...)");
        await fnBinding.execute();
        const res = fnBinding.getBoundContext()?.getObject();
        unreadCount = res?.value ?? 0;
      } catch {/* sessizce geç */}

      // Buton kapsayıcısı
      const wrapper = document.createElement("div");
      wrapper.id = "stNotifBtn";
      wrapper.className = "stNotifBtnWrapper";
      wrapper.setAttribute("title", "Bildirimleri göster");
      wrapper.innerHTML = `
            <span class="stNotifBellIcon" aria-label="Bildirimler">🔔</span>
            <span class="stNotifBadge" style="display:${unreadCount > 0 ? "flex" : "none"}">${Math.min(unreadCount, 99)}</span>
        `;
      _badgeEl = wrapper.querySelector(".stNotifBadge");
      wrapper.addEventListener("click", async () => {
        // Geçici Button UI5 nesnesi açılış noktası olarak kullan
        const tempBtn = new Button();
        tempBtn.placeAt(document.createElement("div")); // renderlemeden DOM dışı yere koy
        await new Promise(r => setTimeout(r, 0));
        openNotificationPopover(wrapper, model);
      });

      // SAP Shell bar'ı veya Fiori page header'ı bul ve başına ekle
      const shellBar = document.querySelector(".sapFShellBar") ?? document.querySelector(".sapMPageHeader") ?? document.querySelector(".sapUxAPObjectPageHeader");
      if (shellBar) {
        shellBar.appendChild(wrapper);
      } else {
        // Fallback: sayfanın sağ üst köşesine fixed pozisyonla
        wrapper.style.position = "fixed";
        wrapper.style.top = "8px";
        wrapper.style.right = "16px";
        wrapper.style.zIndex = "1000";
        document.body.appendChild(wrapper);
      }
    }, 1200);
  }
  var __exports = {
    __esModule: true
  };
  __exports.openNotificationPopover = openNotificationPopover;
  __exports.injectNotificationButton = injectNotificationButton;
  return __exports;
});
//# sourceMappingURL=NotificationPopover-dbg.js.map
