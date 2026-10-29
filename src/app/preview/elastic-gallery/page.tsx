import { ElasticGallery } from "@/components/ui/elastic-gallery";

/**
 * Standalone preview of the Elastic Gallery — an accordion-style image gallery
 * that expands the hovered/clicked panel. Outside the portal route groups so it
 * renders under the root layout alone. Matches the other preview pages.
 */
export const metadata = { title: "Elastic Gallery — Preview" };

export default function ElasticGalleryPreview() {
  return (
    <main className="flex min-h-screen w-full items-center bg-bg">
      <ElasticGallery />
    </main>
  );
}
