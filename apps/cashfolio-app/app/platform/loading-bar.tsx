import { AnimatePresence, motion } from "motion/react";
import { useFetchers, useNavigation } from "react-router";
import { useDebouncedValue } from "./debounce";
import { nprogress, NavigationProgress } from "@mantine/nprogress";
import { useEffect } from "react";

const ANIMATION_DEBOUNCE_IN_MS = 100;

export function LoadingBar() {
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const isNavigating = navigation.state !== "idle" || fetchers.length > 0;
  const isDebouncedNavigating = useDebouncedValue(
    isNavigating,
    ANIMATION_DEBOUNCE_IN_MS,
  );

  useEffect(() => {
    if (isDebouncedNavigating) {
      nprogress.start();
    } else {
      nprogress.complete();
    }
  }, [isDebouncedNavigating]);

  return <NavigationProgress />;
}
