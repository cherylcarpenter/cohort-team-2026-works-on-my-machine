// Client-safe list of the sample bills. No hashes and no server-only imports.
export type DemoBillOption = { file: string; label: string; amount: string; href: string };

export const DEMO_BILLS = [
  { slug: "alder-creek", label: "Alder Creek Landscaping", amount: "$186.42" },
  { slug: "brightwater", label: "Brightwater Water & Sewer", amount: "$324.16" },
  { slug: "copper-ridge", label: "Copper Ridge Waste Services", amount: "$518.70" },
] as const;

export function demoBillOptions(): DemoBillOption[] {
  return DEMO_BILLS.map(({ slug, label, amount }) => ({
    file: `${slug}-bill.pdf`, label, amount, href: `/demo-bills/${slug}-bill.pdf`,
  }));
}
