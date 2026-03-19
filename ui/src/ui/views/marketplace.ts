import { html } from "lit";

export function renderMarketplace(): ReturnType<typeof html> {
  return html`
    <section class="grid">
      <div class="card">
        <div class="card-title" style="font-size: 18px;">Hanzo Marketplace</div>
        <div class="card-sub">Share and discover AI compute capacity</div>
        <div class="marketplace-grid" id="marketplace-listings" style="margin-top: 18px;">
          <div class="marketplace-empty" style="text-align: center; padding: 32px 16px; color: var(--muted);">
            <p>No listings available yet.</p>
            <a
              href="#"
              id="marketplace-sell"
              class="session-link"
              @click=${(e: Event) => {
                e.preventDefault();
              }}
            >Offer your compute</a>
          </div>
        </div>
      </div>
    </section>
  `;
}
