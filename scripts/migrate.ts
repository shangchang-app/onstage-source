import { Store } from '../src/server/db';
const store = new Store(); store.migrate(); store.db.close(); console.log('数据库迁移完成（可重复执行）');
