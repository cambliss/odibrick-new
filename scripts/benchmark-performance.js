/**
 * Odibrick Phase 4 Batch C: Performance Baseline & Latency Benchmarks
 *
 * Reproducible baseline measuring key database queries and domain service methods:
 * - Test conditions: Local MySQL 8.4 on 127.0.0.1:3307, Node.js 20, NestJS context
 * - Metrics: Sample size (N), Min, p50 (median), p90, p95, p99, Max, Mean (avg), StdDev
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

function computeStats(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return sorted[idx];
  };

  return {
    n: sorted.length,
    min: Number(min.toFixed(2)),
    p50: Number(percentile(50).toFixed(2)),
    p90: Number(percentile(90).toFixed(2)),
    p95: Number(percentile(95).toFixed(2)),
    p99: Number(percentile(99).toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
  };
}

async function run() {
  console.log('================================================================');
  console.log('ODIBRICK — PHASE 4 BATCH C: PERFORMANCE & LATENCY BENCHMARKS');
  console.log('Test Target: 127.0.0.1:3307/odibrick | Node ' + process.version);
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const rental = app.get(RentalService);
  const properties = app.get(PropertiesService);

  const adminUser = {
    id: 1,
    publicId: 'SA1',
    fullName: 'Super Admin',
    email: 'admin@demo.odibrick.test',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['tenancy.manage', 'property.publish', 'audit.read', 'user.manage', 'legal.case.manage'],
  };

  const results = {};

  try {
    // -------------------------------------------------------------------------
    // Benchmark 1: Filtered Property Search
    // -------------------------------------------------------------------------
    console.log('1. Benchmarking Filtered Property Query (N=100)...');
    const b1Samples = [];
    for (let i = 0; i < 100; i++) {
      const start = process.hrtime.bigint();
      await db.query(
        `SELECT id, slug, title, locality, city, rent_amount, security_deposit, bedrooms, furnishing, status
           FROM properties
          WHERE status IN ('ACTIVE', 'RENTED') AND rent_amount <= ?
          ORDER BY id DESC LIMIT 24`,
        [100000],
      );
      const end = process.hrtime.bigint();
      b1Samples.push(Number(end - start) / 1e6);
    }
    results['DB-1: Property Search with Filters'] = computeStats(b1Samples);

    // -------------------------------------------------------------------------
    // Benchmark 2: Full Tenancy Detail Assembly (8 parallel sub-queries)
    // -------------------------------------------------------------------------
    console.log('2. Benchmarking Multi-Table Tenancy Assembly (N=50)...');
    const b2Samples = [];
    for (let i = 0; i < 50; i++) {
      const start = process.hrtime.bigint();
      const tenancyId = 1;
      await Promise.all([
        db.query('SELECT * FROM agreements WHERE tenancy_id = ?', [tenancyId]),
        db.query('SELECT * FROM payments WHERE tenancy_id = ? ORDER BY due_date ASC', [tenancyId]),
        db.query('SELECT * FROM legal_meetings WHERE tenancy_id = ?', [tenancyId]),
        db.query('SELECT * FROM inspections WHERE tenancy_id = ?', [tenancyId]),
        db.query('SELECT * FROM legal_cases WHERE tenancy_id = ?', [tenancyId]),
        db.query('SELECT * FROM property_timeline WHERE tenancy_id = ? ORDER BY id DESC', [tenancyId]),
        db.query('SELECT * FROM maintenance_requests WHERE tenancy_id = ?', [tenancyId]),
        db.query('SELECT * FROM disputes WHERE tenancy_id = ? ORDER BY created_at DESC', [tenancyId]),
      ]);
      const end = process.hrtime.bigint();
      b2Samples.push(Number(end - start) / 1e6);
    }
    results['DB-2: Multi-Table Tenancy Assembly'] = computeStats(b2Samples);

    // -------------------------------------------------------------------------
    // Benchmark 3: Atomic Reference Sequence Generation (Concurrency Stress)
    // -------------------------------------------------------------------------
    console.log('3. Benchmarking Atomic Sequence Generator (20 concurrent requests x 25 batches, N=500 ops)...');
    const b3Samples = [];
    for (let batch = 0; batch < 25; batch++) {
      const start = process.hrtime.bigint();
      await Promise.all(
        Array.from({ length: 20 }, () => db.nextSequence('BENCH_SEQ_TEST')),
      );
      const end = process.hrtime.bigint();
      b3Samples.push(Number(end - start) / 1e6);
    }
    results['DB-3: Atomic Sequence 20-Concurrent Batch'] = computeStats(b3Samples);

    // -------------------------------------------------------------------------
    // Benchmark 4: Financial Ledger & Transaction Aggregation
    // -------------------------------------------------------------------------
    console.log('4. Benchmarking Financial Ledger Aggregation (N=100)...');
    const b4Samples = [];
    for (let i = 0; i < 100; i++) {
      const start = process.hrtime.bigint();
      await db.query(
        `SELECT p.id, p.reference_code, p.total_amount, p.status, p.purpose,
                COUNT(pt.id) AS txn_count,
                COALESCE(SUM(CASE WHEN pt.status = 'SUCCESS' THEN pt.amount ELSE 0 END), 0) AS settled_amount
           FROM payments p
           LEFT JOIN payment_transactions pt ON pt.payment_id = p.id
          WHERE p.status = 'PAID'
          GROUP BY p.id
          ORDER BY p.id DESC LIMIT 50`,
      );
      const end = process.hrtime.bigint();
      b4Samples.push(Number(end - start) / 1e6);
    }
    results['DB-4: Financial Ledger & Settlement Aggregation'] = computeStats(b4Samples);

    // -------------------------------------------------------------------------
    // Benchmark 5: Audit Log Retrieval by Entity
    // -------------------------------------------------------------------------
    console.log('5. Benchmarking Audit Log Retrieval (N=100)...');
    const b5Samples = [];
    for (let i = 0; i < 100; i++) {
      const start = process.hrtime.bigint();
      await db.query(
        `SELECT id, actor_id, action, object_type, object_id, created_at
           FROM audit_logs
          WHERE object_type IN ('tenancy', 'dispute', 'payment')
          ORDER BY id DESC LIMIT 25`,
      );
      const end = process.hrtime.bigint();
      b5Samples.push(Number(end - start) / 1e6);
    }
    results['DB-5: Audit Log Retrieval'] = computeStats(b5Samples);

    // -------------------------------------------------------------------------
    // Benchmark 6: Service Layer — RentalService.tenancyDetail
    // -------------------------------------------------------------------------
    console.log('6. Benchmarking RentalService.tenancyDetail (N=50)...');
    const b6Samples = [];
    for (let i = 0; i < 50; i++) {
      const start = process.hrtime.bigint();
      await rental.tenancyDetail(adminUser, 1);
      const end = process.hrtime.bigint();
      b6Samples.push(Number(end - start) / 1e6);
    }
    results['SVC-1: RentalService.tenancyDetail'] = computeStats(b6Samples);

    // -------------------------------------------------------------------------
    // Print Formatted Report
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('BENCHMARK RESULTS SUMMARY (LATENCY IN MILLISECONDS)');
    console.log('================================================================');
    console.log('| Metric / Operation | N | Mean | p50 (Median) | p90 | p95 | p99 | Max | StdDev |');
    console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

    for (const [name, s] of Object.entries(results)) {
      console.log(
        `| ${name} | ${s.n} | ${s.mean} ms | ${s.p50} ms | ${s.p90} ms | ${s.p95} ms | ${s.p99} ms | ${s.max} ms | ±${s.stdDev} ms |`,
      );
    }
    console.log('================================================================\n');

    // Clean up sequence benchmark table row
    await db.query('DELETE FROM reference_sequences WHERE sequence_name = "BENCH_SEQ_TEST"');
    console.log('Cleaned up benchmark sequence fixture.');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
