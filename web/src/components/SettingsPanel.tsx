import { useState } from 'react';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <h2 className="text-lg font-semibold">Settings</h2>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-800 p-6">
          <Field
            label="RPC URL"
            value={settings.rpcUrl}
            onChange={(v) => update({ rpcUrl: v })}
            placeholder="https://rpc.x1.xyz"
          />
          <Field
            label="Multisig Address"
            value={settings.multisigAddress}
            onChange={(v) => update({ multisigAddress: v })}
            placeholder="Squads multisig PDA"
          />
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Vault Index
            </label>
            <input
              type="number"
              min={0}
              value={settings.vaultIndex}
              onChange={(e) =>
                update({ vaultIndex: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Field
            label="Recipient Address"
            value={settings.recipientAddress}
            onChange={(v) => update({ recipientAddress: v })}
            placeholder="Solana address to receive minted tokens"
          />
          <Field
            label="Squads Program ID (optional)"
            value={settings.programId}
            onChange={(v) => update({ programId: v })}
            placeholder="Leave blank for default"
          />
          <p className="text-xs text-gray-500">
            Settings are saved to localStorage automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
