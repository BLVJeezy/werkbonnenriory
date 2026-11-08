export function validateDrawnSignature(value: unknown): string {
  if (typeof value !== "string" || value.length < 200 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("Teken eerst je handtekening");
  }
  if (value.length > 400_000) throw new Error("Handtekening is te groot");
  return value;
}

export function canEmployerSign(contract: { status: string; employer_signature_image?: string | null }): boolean {
  return ["draft", "awaiting_signature", "signed"].includes(contract.status) && !contract.employer_signature_image;
}

export function canEditContractText(contract: { status: string; employee_signed_at?: string | null; employer_signature_image?: string | null }): boolean {
  return ["draft", "awaiting_signature"].includes(contract.status) && !contract.employee_signed_at && !contract.employer_signature_image;
}