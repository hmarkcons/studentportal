import { CalendlyCarousel, type CarouselItem } from "@/components/ui/connected-carousel";

/**
 * Standalone, full-screen preview of the Connected Carousel.
 *
 * Outside the portal route groups, so it renders under the root layout alone —
 * no sidebar, no shell. Matches the perspective-tunnel / aurora preview pattern.
 * Demo data uses stable Unsplash portraits (the project allowlists no remote
 * image domains and renders stock URLs as plain <img>).
 */
export const metadata = { title: "Connected Carousel — Preview" };

const U = "?q=80&w=900&auto=format&fit=crop";

const STORIES: CarouselItem[] = [
  {
    id: "studio-prism",
    stat: "140+ design sprints completed",
    quote: "Automating client bookings unlocked uninterrupted deep work and transformed our delivery cadence.",
    author: "Elena Rostova",
    role: "Head of Product Design, Studio Prism",
    defaultImage: `https://images.unsplash.com/photo-1544005313-94ddf0286df2${U}`,
    selectedImage: `https://images.unsplash.com/photo-1544005313-94ddf0286df2${U}`,
    alt: "Elena Rostova",
  },
  {
    id: "veloce-ai",
    stat: "99.4% client meeting attendance",
    quote: "Smart qualification workflows removed manual no-shows completely and gave our team its focus back.",
    author: "Julian Chen",
    role: "VP of Engineering, Veloce AI",
    defaultImage: `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e${U}`,
    selectedImage: `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e${U}`,
    alt: "Julian Chen",
  },
  {
    id: "hyperion-health",
    stat: "65 hours saved monthly",
    quote: "Patients schedule specialty consultations in seconds, giving our clinicians more high-value care time.",
    author: "Dr. Amara Okafor",
    role: "Chief Medical Officer, Hyperion Health",
    defaultImage: `https://images.unsplash.com/photo-1594824476967-48c8b964273f${U}`,
    selectedImage: `https://images.unsplash.com/photo-1594824476967-48c8b964273f${U}`,
    alt: "Dr. Amara Okafor",
  },
  {
    id: "aura-craft",
    stat: "$48,000 saved annually",
    quote: "Eliminating email tennis accelerated our bespoke customer intake and elevated our brand impression.",
    author: "Maya Lindqvist",
    role: "Creative Director & Founder, Aura Craft",
    defaultImage: `https://images.unsplash.com/photo-1487412720507-e7ab37603c6f${U}`,
    selectedImage: `https://images.unsplash.com/photo-1487412720507-e7ab37603c6f${U}`,
    alt: "Maya Lindqvist",
  },
  {
    id: "echo-labs",
    stat: "82% less coordination overhead",
    quote: "Distributed async scheduling let our remote founders operate seamlessly across twelve timezones.",
    author: "Siddharth Rao",
    role: "Co-Founder & COO, Echo Labs",
    defaultImage: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d${U}`,
    selectedImage: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d${U}`,
    alt: "Siddharth Rao",
  },
];

export default function ConnectedCarouselPreview() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-bg px-4 py-8">
      <CalendlyCarousel items={STORIES} autoPlayInterval={6000} pauseOnHover={false} />
    </main>
  );
}
