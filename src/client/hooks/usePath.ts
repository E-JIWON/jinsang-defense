import { useCallback, useEffect, useState } from "react";

/** 화면이 "/"와 "/r/:code" 둘뿐이라 라우터 대신 history API만 쓴다. */
export function usePath() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    history.pushState(null, "", to);
    setPath(to);
  }, []);

  return [path, navigate] as const;
}
