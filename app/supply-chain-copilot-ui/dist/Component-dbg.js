sap.ui.define(["sap/fe/core/AppComponent", "./ext/util/NotificationPopover"], function (BaseComponent, ___ext_util_NotificationPopover) {
  "use strict";

  const injectNotificationButton = ___ext_util_NotificationPopover["injectNotificationButton"];
  /**
   * @namespace customer.supplychaincopilot.supplychaincopilotui
   */
  const Component = BaseComponent.extend("customer.supplychaincopilot.supplychaincopilotui.Component", {
    metadata: {
      manifest: "json"
    },
    init: function _init() {
      BaseComponent.prototype.init.call(this);
      this._initNotifications();
    },
    _initNotifications: function _initNotifications() {
      // Router navigate tamamlanınca model hazır olur
      const router = this.getRouter();
      router.attachRouteMatched(() => {
        const model = this.getModel();
        if (model) {
          injectNotificationButton(model);
        }
      });
    }
  });
  return Component;
});
//# sourceMappingURL=Component-dbg.js.map
