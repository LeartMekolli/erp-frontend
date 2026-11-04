function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Add it to .env.local (see README).`);
  return value;
}

/** erp-api's address as AMI's server reaches it. */
export function serverApiUrl(): string {
  return required("ERP_API_URL", process.env.ERP_API_URL);
}

/** erp-api's address as the browser reaches it. Read literally so Next inlines it at build. */
export function browserApiUrl(): string {
  return required("NEXT_PUBLIC_ERP_API_URL", process.env.NEXT_PUBLIC_ERP_API_URL);
}
