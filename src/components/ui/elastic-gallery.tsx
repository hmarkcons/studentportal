"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

// Adapted from the 21st.dev "Elastic Gallery": next/image swapped for a plain
// <img> (the project allowlists no remote image domains), `cn` for a local
// joiner, and the 21st.dev CDN images for stable Unsplash stock URLs.

/** Tiny class joiner — the project has no `cn`/clsx util. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

interface ElasticItemProps {
  id: string;
  title: string;
  category: string;
  src: string;
  alt: string;
}

const U = "?q=80&w=1200&auto=format&fit=crop";

function ElasticGallery() {
  const items: ElasticItemProps[] = [
    { id: "01", title: "Neon Cyber", category: "Photography", src: `https://images.unsplash.com/photo-1579546929518-9e396f3cc809${U}`, alt: "Neon lights" },
    { id: "02", title: "Urban Brutalism", category: "Architecture", src: `https://images.unsplash.com/photo-1486718448742-163732cd1544${U}`, alt: "Brutalist architecture" },
    { id: "03", title: "Abstract Fluid", category: "Design", src: `https://images.unsplash.com/photo-1557672172-298e090bd0f1${U}`, alt: "Abstract fluid art" },
    { id: "04", title: "Silent Nature", category: "Landscape", src: `https://images.unsplash.com/photo-1441974231531-c6227db76b6e${U}`, alt: "Misty forest" },
    { id: "05", title: "Future Tech", category: "Innovation", src: `https://images.unsplash.com/photo-1614850523459-c2f4c699c52e${U}`, alt: "Futuristic technology" },
  ];

  const [activeId, setActiveId] = useState<string | null>("03");

  return (
    <div className="w-full py-12 dark:bg-black md:py-24">
      {/* Fixed height keeps the flex animation stable on mobile and desktop. */}
      <div className="mx-auto flex h-[500px] w-full max-w-6xl flex-col gap-2 px-4 md:h-[600px] md:flex-row md:gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            onMouseEnter={() => setActiveId(item.id)}
            onClick={() => setActiveId(item.id)}
            className={cx(
              "relative cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950",
              "transition-[flex,filter] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]",
              activeId === item.id ? "flex-[4]" : "flex-[1]",
              activeId === item.id ? "brightness-100" : "brightness-50 hover:brightness-75",
            )}
          >
            <div className="absolute inset-0 h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote stock URL, not a file next/image can optimise */}
              <img
                src={item.src}
                alt={item.alt}
                draggable={false}
                className={cx("absolute inset-0 h-full w-full object-cover transition-transform duration-1000", activeId === item.id ? "scale-100" : "scale-110")}
              />
              <div className={cx("absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-500", activeId === item.id ? "opacity-100" : "opacity-0")} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex h-full flex-col justify-end p-4 md:p-8">
              <div className={cx("flex flex-col gap-2 transition-all duration-500", activeId === item.id ? "translate-y-0 opacity-100 delay-200" : "translate-y-12 opacity-0")}>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-md md:px-3 md:text-xs">
                    {item.category}
                  </span>
                </div>

                <h3 className="text-2xl font-black uppercase leading-none text-white md:text-5xl">{item.title}</h3>

                <div className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/80 md:mt-4 md:text-sm">
                  View Project <ArrowUpRight className="h-3 w-3 md:h-4 md:w-4" />
                </div>
              </div>

              <div className={cx("absolute transition-all duration-500", "bottom-4 left-1/2 -translate-x-1/2 md:bottom-8", activeId === item.id ? "opacity-0 scale-50" : "opacity-100 delay-500")}>
                <span className="hidden whitespace-nowrap text-xl font-bold uppercase tracking-widest text-white [writing-mode:vertical-rl] md:block">{item.title}</span>
                <span className="block text-xs font-bold text-white md:hidden">{item.id}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ElasticGallery };
export default ElasticGallery;
