import BaseComponent from "sap/fe/core/AppComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { injectNotificationButton } from "./ext/util/NotificationPopover";

/**
 * @namespace customer.supplychaincopilot.supplychaincopilotui
 */
export default class Component extends BaseComponent {

    public static metadata = {
        manifest: "json"
    };

    public init(): void {
        super.init();
        this._initNotifications();
    }

    private _initNotifications(): void {
        // Router navigate tamamlanınca model hazır olur
        const router = this.getRouter();
        router.attachRouteMatched(() => {
            const model = this.getModel() as ODataModel;
            if (model) {
                injectNotificationButton(model);
            }
        });
    }
}
