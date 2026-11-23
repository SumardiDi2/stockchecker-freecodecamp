const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

// The price proxy does not support every symbol, so find two that work.
const CANDIDATES = ['GOOG', 'AAPL', 'AMZN', 'TSLA', 'NVDA', 'META', 'IBM', 'INTC', 'MSFT'];

suite('Functional Tests', function () {
  this.timeout(30000);

  let A, B; // two symbols the proxy supports
  let likesAfterFirstLike;

  suiteSetup(async function () {
    const valid = [];
    for (const sym of CANDIDATES) {
      if (valid.length === 2) break;
      const res = await chai.request(server).get('/api/stock-prices').query({ stock: sym });
      if (res.body.stockData && typeof res.body.stockData.price === 'number') valid.push(sym);
    }
    assert.lengthOf(valid, 2, 'Need two symbols supported by the price proxy');
    [A, B] = valid;
  });

  test('Viewing one stock: GET request to /api/stock-prices/', function (done) {
    chai.request(server).get('/api/stock-prices').query({ stock: A })
      .end(function (err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.body.stockData.stock, A);
        assert.isNumber(res.body.stockData.price);
        assert.isNumber(res.body.stockData.likes);
        done();
      });
  });

  test('Viewing one stock and liking it: GET request to /api/stock-prices/', function (done) {
    chai.request(server).get('/api/stock-prices').query({ stock: A, like: true })
      .end(function (err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.body.stockData.stock, A);
        assert.isNumber(res.body.stockData.price);
        assert.isAtLeast(res.body.stockData.likes, 1);
        likesAfterFirstLike = res.body.stockData.likes;
        done();
      });
  });

  test('Viewing the same stock and liking it again: GET request to /api/stock-prices/', function (done) {
    chai.request(server).get('/api/stock-prices').query({ stock: A, like: true })
      .end(function (err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.body.stockData.likes, likesAfterFirstLike); // no double like
        done();
      });
  });

  test('Viewing two stocks: GET request to /api/stock-prices/', function (done) {
    chai.request(server).get('/api/stock-prices').query({ stock: [A, B] })
      .end(function (err, res) {
        assert.equal(res.status, 200);
        assert.isArray(res.body.stockData);
        assert.lengthOf(res.body.stockData, 2);
        res.body.stockData.forEach(s => {
          assert.isString(s.stock);
          assert.isNumber(s.price);
          assert.isNumber(s.rel_likes);
          assert.notProperty(s, 'likes');
        });
        done();
      });
  });

  test('Viewing two stocks and liking them: GET request to /api/stock-prices/', function (done) {
    chai.request(server).get('/api/stock-prices').query({ stock: [A, B], like: true })
      .end(function (err, res) {
        assert.equal(res.status, 200);
        const [a, b] = res.body.stockData;
        assert.isNumber(a.price);
        assert.isNumber(b.price);
        assert.isNumber(a.rel_likes);
        assert.isNumber(b.rel_likes);
        assert.equal(a.rel_likes, -b.rel_likes);
        done();
      });
  });
});
