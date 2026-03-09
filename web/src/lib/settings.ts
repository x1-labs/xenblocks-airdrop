import { DEFAULT_RPC_URL } from './constants';

const STORAGE_KEY = 'xenblocks-admin-settings';

export interface Settings {
  rpcUrl: string;
  multisigAddress: string;
  vaultIndex: number;
  recipientAddress: string;
  programId: string;
}

const DEFAULTS: Settings = {
  rpcUrl: DEFAULT_RPC_URL,
  multisigAddress: '',
  vaultIndex: 0,
  recipientAddress: '',
  programId: '',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
