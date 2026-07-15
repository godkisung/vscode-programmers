import * as vscode from 'vscode';

const COOKIE_KEY = 'programmers.sessionCookie';

export async function getCookie(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(COOKIE_KEY);
}

export async function setCookie(secrets: vscode.SecretStorage, cookie: string): Promise<void> {
  await secrets.store(COOKIE_KEY, cookie);
}
