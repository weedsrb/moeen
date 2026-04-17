type GsapModule = Awaited<ReturnType<typeof load>>;

async function load() {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

let cached: Promise<GsapModule> | null = null;

export function loadGsap(): Promise<GsapModule> {
  return (cached ??= load());
}
