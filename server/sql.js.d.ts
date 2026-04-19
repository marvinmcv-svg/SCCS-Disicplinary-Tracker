declare module 'sql.js' {
  class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: any[]): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  class Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any): any;
    free(): boolean;
    run(params?: any[]): void;
  }

  interface SqlJsStatic {
    Database: new (data?: any) => Database;
  }

  function initSqlJs(): Promise<SqlJsStatic>;

  export = initSqlJs;
}