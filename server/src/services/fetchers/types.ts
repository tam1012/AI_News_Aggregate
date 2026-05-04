export interface SourceRow {
  id: string;
  type: string;
  name: string;
  url: string;
  language: string;
  category: string | null;
  fetch_interval_minutes: number;
  parser_config: any;
}

export interface ScrapeResult {
  itemsFound: number;
  itemsInserted: number;
  errors: string[];
}

export interface SourceFetcher {
  key: string;
  canHandle(source: Pick<SourceRow, 'type' | 'url'>): boolean;
  fetch(source: SourceRow): Promise<ScrapeResult>;
}
