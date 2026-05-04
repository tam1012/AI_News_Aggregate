import Parser from 'rss-parser';
const parser = new Parser();

async function test() {
  try {
    const res = await fetch('https://www.reddit.com/r/technology/comments/1t2m2jt/.rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    console.log(Object.keys(feed.items[1]));
    console.log('author:', feed.items[1].author);
  } catch (e) {
    console.error(e);
  }
}
test();
