const STORAGE_KEY = "qqm_token";

let currentToken: string | null = localStorage.getItem(STORAGE_KEY);

export function getToken(): string | null {
  return currentToken;
}

export function setToken(token: string | null): void {
  currentToken = token;
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
