import type { ComponentProps } from "react";
import { SearchSelect } from "@/components/SearchSelect";

type Customer = {
  id: string; name: string; customer_number?: string | null; customer_numbers?: string[] | null;
  street?: string | null; house_number?: string | null; postal_code?: string | null;
  city?: string | null; email?: string | null; billing_email?: string | null; phone?: string | null;
};

export function CustomerPicker({ customers, ...props }: Omit<ComponentProps<typeof SearchSelect>, "options" | "searchPlaceholder"> & { customers: Customer[] }) {
  return <SearchSelect {...props} searchPlaceholder="Zoek klantnummer, naam of adres…" options={customers.map(c => ({
    value: c.id,
    label: [c.customer_number, c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — "),
    search: [c.customer_numbers?.join(" "), c.postal_code, c.email, c.billing_email, c.phone].filter(Boolean).join(" "),
  }))} />;
}