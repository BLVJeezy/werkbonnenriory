const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Dringend alleen bij "URGENT" in het onderwerp of de vaste urgentiezin in de mail. */
export function isUrgentMail(subject: string | null | undefined, body: string | null | undefined): boolean {
  if (/\burgent\b/i.test(subject ?? "")) return true;
  return norm(body ?? "").includes("hoge urgentie, indien mogelijk vandaag geholpen");
}
