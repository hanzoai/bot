import { pluginRegistrationContractCases } from "bot/plugin-sdk/plugin-test-contracts";
import { describePluginRegistrationContract } from "bot/plugin-sdk/plugin-test-contracts";

describePluginRegistrationContract(pluginRegistrationContractCases.parallel);
