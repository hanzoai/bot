import { html } from "lit";
import type { CustodianRouteData } from "./route.ts";

export function renderCustodianRoute(data: CustodianRouteData | undefined) {
  return html`
    <bot-custodian-page
      .onboarding=${data?.onboarding === true}
      .newAgentIntent=${data?.intent === "new-agent"}
    ></bot-custodian-page>
  `;
}
