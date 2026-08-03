import { useState } from "react";
import { Badge } from "../../components/primitives/Badge";
import { useCanonicalRuntimeStatus } from "../../data/hooks/useRuntimeStatus";
import { useExitRuleSettings, useWatchedWalletSettings } from "../../data/hooks/useExitSettings";
import { formatSolV2 } from "../../lib/formatters";
import "./settings.css";

export function SettingsPage() {
  const runtime = useCanonicalRuntimeStatus();
  const wallets = useWatchedWalletSettings();
  const rules = useExitRuleSettings();
  const [density, setDensity] = useState("compact");
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState("all_active");

  return (
    <section className="axi-v2-page axi-v2-settings-page" aria-labelledby="settings-title">
      <header className="axi-v2-page__heading"><div><h1 className="axi-v2-page-title" id="settings-title">Settings</h1><p className="axi-v2-page-description">Display preferences and read-only paper workflow configuration. No secrets or execution controls.</p></div><Badge tone="info">Local operator UI</Badge></header>
      <div className="axi-v2-settings-grid">
        <SettingsPanel title="Display">
          <SettingSelect label="Scanner density" value={density} onChange={setDensity} options={[['compact', 'Compact'], ['comfortable', 'Comfortable']]} />
          <SettingSelect label="Default sort" value={sort} onChange={setSort} options={[['newest', 'Newest'], ['score', 'Score'], ['derivative', 'Derivative strength'], ['volume', 'Volume'], ['buyers', 'Buyers'], ['risk', 'Risk']]} />
          <SettingSelect label="Default filter" value={filter} onChange={setFilter} options={[['all_active', 'All active'], ['discovery', 'Discovery'], ['tracking', 'Tracking'], ['d2_ready', 'D2 ready'], ['hot', 'HOT'], ['ripping', 'RIPPING'], ['positions', 'Positions']]} />
          <p>Preferences apply to this V2 browser view; runtime permissions remain backend-owned.</p>
        </SettingsPanel>

        <SettingsPanel title="Public data wallet">
          {runtime.data ? <dl className="axi-v2-settings-list"><div><dt>Address</dt><dd className="axi-v2-mono">{runtime.data.dataWallet.shortPublicKey ?? "Not configured"}</dd></div><div><dt>Balance</dt><dd>{formatSolV2(runtime.data.dataWallet.balanceSol)}</dd></div><div><dt>Status</dt><dd>{runtime.data.dataWallet.balanceStatus}</dd></div><div><dt>API credential</dt><dd>{runtime.data.dataWallet.apiKeyConfigured ? "Configured server-side" : "Not configured"}</dd></div></dl> : <p>Data-wallet status unavailable.</p>}
          <p>Credentials are configured outside the dashboard and are never returned to this UI.</p>
        </SettingsPanel>

        <SettingsPanel title="Watched public wallets" badge={<Badge>{wallets.data?.current.length ?? 0}</Badge>}>
          {wallets.isError ? <p>Watched-wallet configuration is unavailable.</p> : wallets.data?.current.length ? <ul className="axi-v2-settings-items">{wallets.data.current.map((wallet) => <li key={wallet.address}><span><strong>{wallet.alias ?? `${wallet.address.slice(0, 7)}…${wallet.address.slice(-6)}`}</strong><small>{wallet.tags.join(", ") || "No tags"}</small></span><Badge tone={wallet.enabled ? "positive" : "neutral"}>{wallet.enabled ? "enabled" : "paused"}</Badge></li>)}</ul> : <p>No public wallets are configured for paper exit evidence.</p>}
          <p>Account-trade monitoring remains disabled unless separately and explicitly enabled outside this UI.</p>
        </SettingsPanel>

        <SettingsPanel title="Paper exit rules" badge={<Badge>{rules.data?.current.length ?? 0}</Badge>}>
          {rules.isError ? <p>Exit-rule configuration is unavailable.</p> : rules.data?.current.length ? <ul className="axi-v2-settings-items">{rules.data.current.map((rule) => <li key={rule.id}><span><strong>{rule.name}</strong><small>{rule.trigger.replaceAll("_", " ")} · min {rule.minProfitPct}% · paper sell {rule.sellPct}%</small></span><Badge tone={rule.enabled ? "positive" : "neutral"}>{rule.enabled ? "enabled" : "paused"}</Badge></li>)}</ul> : <p>No watched-wallet paper exit rules are configured.</p>}
          <p>Rules can create paper exit evidence only; they cannot submit transactions.</p>
        </SettingsPanel>
      </div>

      <details className="axi-v2-future-readiness">
        <summary>Future execution readiness</summary>
        <div><Badge tone="danger">Live execution disabled</Badge><p>This section is intentionally collapsed. There is no Arm, Buy, Sell, signing, private-key, or Lightning control in V2.</p></div>
      </details>
    </section>
  );
}

function SettingsPanel({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return <section className="axi-v2-settings-panel"><header><h2>{title}</h2>{badge}</header>{children}</section>;
}

function SettingSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="axi-v2-setting-control"><span>{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
