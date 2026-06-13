import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'tv_access';
const REFRESH_KEY = 'tv_refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens(): Promise<void> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export const getAccess = () => accessToken;
export const getRefresh = () => refreshToken;
export const hasSession = () => accessToken !== null;
