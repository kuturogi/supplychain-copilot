import JourneyRunner from "sap/fe/test/JourneyRunner";
import ListReport from "sap/fe/test/ListReport";
import ObjectPage from "sap/fe/test/ObjectPage";
import CustomStockLevelsListGenerated from "./StockLevelsList.gen";
import CustomStockLevelsObjectPageGenerated from "./StockLevelsObjectPage.gen";

const runner = new JourneyRunner({
    launchUrl: sap.ui.require.toUrl("customer/supplychaincopilot/supplychaincopilotui") + "/test/flpSandbox.html#customersupplychaincopilotsupp-tile",
    pages: {
        onTheStockLevelsListGenerated: new ListReport(
            {
                appId: "customer.supplychaincopilot.supplychaincopilotui",
                componentId: "StockLevelsList",
                contextPath: "/StockLevels"
            },
            CustomStockLevelsListGenerated
        ),
        onTheStockLevelsObjectPageGenerated: new ObjectPage(
            {
                appId: "customer.supplychaincopilot.supplychaincopilotui",
                componentId: "StockLevelsObjectPage",
                contextPath: "/StockLevels"
            },
            CustomStockLevelsObjectPageGenerated
        )
    },
    async: true
});

export default runner;