import { useRef, type KeyboardEvent } from "react";
import {
  primaryRoutes,
  routeLabels,
  type AppRoute,
  type PrimaryRoute
} from "../../app/navigation";

export function PrimaryNavigation({
  route,
  onNavigate
}: {
  route: AppRoute;
  onNavigate: (route: PrimaryRoute) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = primaryRoutes.findIndex((item) => item === route);
    const fallbackIndex = currentIndex < 0 ? 0 : currentIndex;
    let target = fallbackIndex;
    if (event.key === "ArrowRight") target = (fallbackIndex + 1) % primaryRoutes.length;
    else if (event.key === "ArrowLeft") target = (fallbackIndex - 1 + primaryRoutes.length) % primaryRoutes.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = primaryRoutes.length - 1;
    else return;
    event.preventDefault();
    const targetRoute = primaryRoutes[target];
    if (targetRoute) {
      onNavigate(targetRoute);
      refs.current[target]?.focus();
    }
  }

  return (
    <div className="axi-v2-primary-nav" role="tablist" aria-label="Primary navigation" onKeyDown={handleKeyDown}>
      {primaryRoutes.map((item, index) => {
        const selected = item === route;
        return (
          <button
            key={item}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected || (route !== "scanner" && route !== "positions" && route !== "research" && index === 0) ? 0 : -1}
            className="axi-v2-primary-nav__item"
            onClick={() => onNavigate(item)}
          >
            {routeLabels[item]}
          </button>
        );
      })}
    </div>
  );
}
