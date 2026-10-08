import { useEffect, useState } from 'react';
import { loadCatalog, type Catalog } from './content';

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadCatalog().then(setCatalog, () => setError(true));
  }, []);
  return { catalog, error };
}
