import { scrapeRedditSource } from './src/services/scraper.js';

const mockSource = {
  id: 'test',
  type: 'rss',
  name: 'test',
  url: 'https://www.reddit.com/r/technology',
  language: 'vi',
  category: 'tech',
  fetch_interval_minutes: 60,
  parser_config: {}
};

async function test() {
  console.log('Testing scrapeRedditSource...');
  const res = await scrapeRedditSource(mockSource);
  console.log('Result:', res);
  process.exit(0);
}

test();
