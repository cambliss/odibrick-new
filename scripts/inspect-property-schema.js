require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);

  const fks = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME = 'properties' AND TABLE_SCHEMA = DATABASE()
  `);
  console.log('Foreign keys referencing properties:');
  console.log(JSON.stringify(fks, null, 2));

  const cols = await db.query(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'properties' AND TABLE_SCHEMA = DATABASE()
  `);
  console.log('\nColumns in properties table:');
  console.log(cols.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE}, nullable: ${c.IS_NULLABLE}, default: ${c.COLUMN_DEFAULT})`).join('\n'));

  // Also check all tables with property_id column
  const allPropertyIdCols = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME IN ('property_id', 'subject_property_id') AND TABLE_SCHEMA = DATABASE()
  `);
  console.log('\nAll tables with property_id or subject_property_id:');
  console.log(allPropertyIdCols);

  await app.close();
}
main();
