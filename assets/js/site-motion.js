(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const screen = window.matchMedia("screen");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const revealTargets = [...document.querySelectorAll("[data-reveal]")];
    const progressBars = [...document.querySelectorAll("[data-scroll-progress]")];
    const header = document.querySelector(".site-header");

    function targetFromHash(hash) {
        if (!hash.startsWith("#") || hash.length < 2) return null;

        const id = hash.slice(1);
        try {
            return document.getElementById(decodeURIComponent(id));
        } catch {
            return document.getElementById(id);
        }
    }

    const chapters = [...document.querySelectorAll("[data-chapter-link]")]
        .map(link => ({ link, section: targetFromHash(link.hash || "") }))
        .filter(chapter => chapter.section);

    let revealObserver = null;
    let scrollFrame = 0;
    let activeSection;
    let lastProgress;

    function reveal(element) {
        element.dataset.revealState = "visible";
        revealObserver?.unobserve(element);
    }

    function revealAll() {
        revealObserver?.disconnect();
        revealObserver = null;
        revealTargets.forEach(reveal);
    }

    function revealHashTarget() {
        const target = targetFromHash(location.hash);
        if (!target) return;

        for (const element of revealTargets) {
            if (element.contains(target) || target.contains(element)) reveal(element);
        }
    }

    function updateScrollState() {
        scrollFrame = 0;
        const scroller = document.scrollingElement || root;
        const distance = scroller.scrollHeight - scroller.clientHeight;
        const progress = distance > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / distance)) : 1;

        let current = null;
        if (chapters.length) {
            const headerHeight = header?.getBoundingClientRect().height || 0;
            const readingLine = Math.max(headerHeight + 24, Math.min(window.innerHeight * 0.32, 240));
            for (const { section } of chapters) {
                if (section.getBoundingClientRect().top <= readingLine) current = section;
            }
            if (distance > 0 && scroller.scrollTop >= distance - 1) {
                current = chapters[chapters.length - 1].section;
            }
        }

        if (progress !== lastProgress) {
            for (const bar of progressBars) bar.style.transform = `scaleX(${progress})`;
            lastProgress = progress;
        }

        if (current !== activeSection) {
            for (const { link, section } of chapters) {
                if (section === current) {
                    link.setAttribute("aria-current", "location");
                } else if (link.getAttribute("aria-current") === "location") {
                    link.removeAttribute("aria-current");
                }
            }
            activeSection = current;
        }
    }

    function scheduleScrollUpdate() {
        if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollState);
    }

    function enableTilt(portrait) {
        let frame = 0;
        let pointer = null;

        function renderTilt() {
            frame = 0;
            if (!pointer) return;
            const rect = portrait.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const x = Math.min(1, Math.max(0, (pointer.x - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (pointer.y - rect.top) / rect.height));
            portrait.style.setProperty("--portrait-rotate-x", `${((0.5 - y) * 6).toFixed(2)}deg`);
            portrait.style.setProperty("--portrait-rotate-y", `${((x - 0.5) * 6).toFixed(2)}deg`);
            portrait.style.setProperty("--portrait-light-x", `${(x * 100).toFixed(1)}%`);
            portrait.style.setProperty("--portrait-light-y", `${(y * 100).toFixed(1)}%`);
            portrait.setAttribute("data-tilt-active", "");
        }

        function resetTilt() {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            pointer = null;
            portrait.style.removeProperty("--portrait-rotate-x");
            portrait.style.removeProperty("--portrait-rotate-y");
            portrait.style.removeProperty("--portrait-light-x");
            portrait.style.removeProperty("--portrait-light-y");
            portrait.removeAttribute("data-tilt-active");
        }

        portrait.addEventListener("pointermove", event => {
            if (!screen.matches || reducedMotion.matches || !finePointer.matches || event.pointerType === "touch") return;
            pointer = { x: event.clientX, y: event.clientY };
            if (!frame) frame = window.requestAnimationFrame(renderTilt);
        }, { passive: true });
        portrait.addEventListener("pointerleave", resetTilt);
        portrait.addEventListener("pointercancel", resetTilt);
        return resetTilt;
    }

    const resetTilts = [...document.querySelectorAll("[data-portrait-tilt]")].map(enableTilt);
    function resetAllTilts() {
        resetTilts.forEach(reset => reset());
    }

    function syncMotionPreference() {
        const enabled = screen.matches && !reducedMotion.matches;
        root.classList.toggle("motion-ready", enabled);
        if (!enabled || !("IntersectionObserver" in window)) {
            revealAll();
            resetAllTilts();
            return;
        }

        revealHashTarget();
        if (revealObserver || !revealTargets.length) return;

        revealObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) reveal(entry.target);
            }
        }, { rootMargin: "0px 0px -36px 0px" });

        for (const element of revealTargets) {
            if (element.dataset.revealState === "visible") continue;
            if (element.getBoundingClientRect().top < window.innerHeight) {
                reveal(element);
            } else {
                element.dataset.revealState = "pending";
                revealObserver.observe(element);
            }
        }
    }

    document.addEventListener("focusin", event => {
        for (const element of revealTargets) {
            if (element.dataset.revealState === "pending" && element.contains(event.target)) reveal(element);
        }
    });
    window.addEventListener("hashchange", () => {
        revealHashTarget();
        scheduleScrollUpdate();
    });
    window.addEventListener("pageshow", () => {
        revealHashTarget();
        scheduleScrollUpdate();
    });
    window.addEventListener("beforeprint", () => {
        revealAll();
        resetAllTilts();
    });
    window.addEventListener("blur", resetAllTilts);
    reducedMotion.addEventListener("change", syncMotionPreference);
    finePointer.addEventListener("change", resetAllTilts);

    if (progressBars.length || chapters.length) {
        window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
        window.addEventListener("resize", scheduleScrollUpdate);
        window.addEventListener("load", scheduleScrollUpdate, { once: true });
        if ("ResizeObserver" in window) new ResizeObserver(scheduleScrollUpdate).observe(document.body);
        scheduleScrollUpdate();
    }

    syncMotionPreference();
})();
