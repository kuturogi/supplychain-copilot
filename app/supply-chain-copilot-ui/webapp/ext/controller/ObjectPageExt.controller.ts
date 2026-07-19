import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

/**
 * Stok detay sayfası controller extension'ı.
 * Buton handler'ları class İÇİNDE metod olmalı; Fiori Elements
 * ".extension...." yolunu instance üzerinde çözer.
 */
export default class ObjectPageExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: ObjectPageExt): void {
            console.log(
                "ObjectPageExt Controller Extension yüklendi."
            );
        }
    };

    /**
     * Talep Tahmini (AI) butonuna basıldığında çalışır.
     * Açık olan stok kaydının ID'sini backend'deki forecastDemand aksiyonuna gönderir.
     */
    public async onForecastDemand(): Promise<void> {
        try {
            console.log("Talep Tahmini butonuna basıldı.");

            const view = this.getView();
            const bindingContext = view?.getBindingContext();
            const stockLevelId = bindingContext?.getProperty("ID");

            if (stockLevelId === undefined || stockLevelId === null) {
                MessageBox.error("Stok kaydı belirlenemedi.");
                return;
            }

            const model = view?.getModel() as ODataModel;

            const actionBinding = model.bindContext(
                "/forecastDemand(...)"
            );

            actionBinding.setParameter("stockLevelId", stockLevelId);

            await actionBinding.execute();

            const actionContext = actionBinding.getBoundContext();

            const result = actionContext?.getObject() as {
                value?: string;
            };

            MessageBox.information(
                result?.value ??
                "Talep tahmini tamamlandı."
            );

        } catch (error) {
            console.error("Talep tahmini hatası:", error);

            MessageBox.error(
                "Talep tahmini sırasında bir hata oluştu."
            );
        }
    }

    /**
     * Sipariş Oluştur butonuna basıldığında çalışır.
     * Miktar 0 gönderilir; backend tüketim hızından 30 günlük öneriyi kendisi hesaplar.
     */
    public async onCreateOrder(): Promise<void> {
        try {
            console.log("Sipariş Oluştur butonuna basıldı.");

            const view = this.getView();
            const bindingContext = view?.getBindingContext();
            const stockLevelId = bindingContext?.getProperty("ID");

            if (stockLevelId === undefined || stockLevelId === null) {
                MessageBox.error("Stok kaydı belirlenemedi.");
                return;
            }

            const model = view?.getModel() as ODataModel;

            const actionBinding = model.bindContext(
                "/createPurchaseOrder(...)"
            );

            actionBinding.setParameter("stockLevelId", stockLevelId);
            actionBinding.setParameter("quantity", 0);

            await actionBinding.execute();

            const actionContext = actionBinding.getBoundContext();

            const result = actionContext?.getObject() as {
                value?: string;
            };

            MessageBox.success(
                result?.value ??
                "Sipariş taslağı oluşturuldu."
            );

        } catch (error) {
            console.error("Sipariş oluşturma hatası:", error);

            MessageBox.error(
                "Sipariş oluşturulurken bir hata oluştu."
            );
        }
    }
}
