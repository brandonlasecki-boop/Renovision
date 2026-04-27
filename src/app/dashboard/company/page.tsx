import { getCompanyForUser } from "@/lib/data/dashboard";
import { CompanyForm } from "@/components/dashboard/company-form";

export default async function CompanyPage() {
  const company = await getCompanyForUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Branding appears at the top of every shared project page.
        </p>
      </div>
      <CompanyForm
        company={
          company
            ? {
                name: company.name,
                tagline: company.tagline,
                brand_color: company.brand_color,
              }
            : null
        }
      />
    </div>
  );
}
