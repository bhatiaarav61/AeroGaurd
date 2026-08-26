/**
 * Build-time Scriptlet Compiler
 * Compiles scriptlets to bytecode at build time
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const SCRIPTLETS_DIR = join(PROJECT_ROOT, 'scriptlets');
const OUTPUT_DIR = join(PROJECT_ROOT, 'dist', 'scriptlets');

// OpCode definitions (must match scriptlet-runtime.js)
const OpCode = {
  PUSH: 0x01, POP: 0x02, DUP: 0x03, SWAP: 0x04,
  LOAD_LOCAL: 0x10, STORE_LOCAL: 0x11, LOAD_GLOBAL: 0x12, STORE_GLOBAL: 0x13,
  GET_PROP: 0x20, SET_PROP: 0x21, HAS_PROP: 0x22, DELETE_PROP: 0x23,
  CALL: 0x30, CALL_METHOD: 0x31, NEW: 0x32, RETURN: 0x33,
  JUMP: 0x40, JUMP_IF: 0x41, JUMP_IF_NOT: 0x42,
  EQ: 0x50, NE: 0x51, LT: 0x52, LE: 0x53, GT: 0x54, GE: 0x55,
  AND: 0x60, OR: 0x61, NOT: 0x62,
  ADD: 0x70, SUB: 0x71, MUL: 0x72, DIV: 0x73, MOD: 0x74, NEG: 0x75,
  TYPEOF: 0x80, INSTANCEOF: 0x81, IN: 0x82,
  REGEXP_TEST: 0x83, REGEXP_MATCH: 0x84,
  STRING_INCLUDES: 0x85, STRING_STARTS_WITH: 0x86, STRING_ENDS_WITH: 0x87,
  QUERY_SELECTOR: 0x90, QUERY_SELECTOR_ALL: 0x91,
  CREATE_ELEMENT: 0x92, SET_ATTRIBUTE: 0x93, REMOVE_ATTRIBUTE: 0x94,
  ADD_EVENT_LISTENER: 0x95, REMOVE_EVENT_LISTENER: 0x96,
  THROW: 0xF0, TRY_CATCH: 0xF1, END_TRY: 0xF2, NOP: 0xFF
};

class ScriptletCompiler {
  constructor() {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap = new Map();
    this.currentLabel = 0;
    this.variableMap = new Map();
    this.nextVarIndex = 0;
  }

  compile(source) {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap.clear();
    this.currentLabel = 0;
    this.variableMap.clear();
    this.nextVarIndex = 0;

    const ast = this._parse(source);
    this._compileAST(ast);
    this._resolveLabels();

    return this._serializeBytecode();
  }

  _parse(source) {
    const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    return { type: 'Program', body: lines.map(l => this._parseStatement(l)) };
  }

  _parseStatement(line) {
    const match = line.match(/^(\w+)\((.*)\)$/);
    if (match) {
      return {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: match[1] },
        arguments: this._parseArguments(match[2])
      };
    }
    return {
      type: 'ExpressionStatement',
      expression: { type: 'Identifier', name: line }
    };
  }

  _parseArguments(argStr) {
    if (!argStr.trim()) return [];
    const args = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argStr.length; i++) {
      const char = argStr[i];
      if ((char === '"' || char === "'") && !inString) {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === stringChar && inString) {
        inString = false;
        stringChar = '';
        current += char;
      } else if (char === ',' && !inString) {
        args.push(this._parseArgument(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) args.push(this._parseArgument(current.trim()));
    return args;
  }

  _parseArgument(arg) {
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return { type: 'Literal', value: arg.slice(1, -1) };
    }
    if (/^\d+$/.test(arg)) return { type: 'Literal', value: parseInt(arg, 10) };
    if (/^\d+\.\d+$/.test(arg)) return { type: 'Literal', value: parseFloat(arg) };
    if (arg === 'true') return { type: 'Literal', value: true };
    if (arg === 'false') return { type: 'Literal', value: false };
    return { type: 'Identifier', name: arg };
  }

  _compileAST(ast) {
    for (const stmt of ast.body) this._compileStatement(stmt);
    this._emit(OpCode.PUSH, 0);
    this._emit(OpCode.RETURN);
  }

  _compileStatement(stmt) {
    switch (stmt.type) {
      case 'CallExpression': this._compileCallExpression(stmt); break;
      case 'ExpressionStatement': this._compileExpression(stmt.expression); break;
    }
  }

  _compileCallExpression(expr) {
    for (let i = expr.arguments.length - 1; i >= 0; i--) this._compileExpression(expr.arguments[i]);
    this._emit(OpCode.PUSH, this._getStringIndex(expr.callee.name));
    this._emit(OpCode.CALL, expr.arguments.length);
  }

  _compileExpression(expr) {
    switch (expr.type) {
      case 'Literal': this._emit(OpCode.PUSH, this._getStringIndex(expr.value)); break;
      case 'Identifier': this._emit(OpCode.LOAD_GLOBAL, this._getStringIndex(expr.name)); break;
    }
  }

  _getStringIndex(str) {
    const index = this.stringTable.indexOf(str);
    if (index !== -1) return index;
    this.stringTable.push(str);
    return this.stringTable.length - 1;
  }

  _emit(...args) { for (const arg of args) this.bytecode.push(arg); }

  _resolveLabels() {}

  _serializeBytecode() {
    const header = new Uint8Array([
      0x41, 0x45, 0x52, 0x4F, 0x01, 0x00, 0x00, 0x00,
      this.stringTable.length & 0xFF, (this.stringTable.length >> 8) & 0xFF,
      this.bytecode.length & 0xFF, (this.bytecode.length >> 8) & 0xFF,
      (this.bytecode.length >> 16) & 0xFF, (this.bytecode.length >> 24) & 0xFF
    ]);

    const stringData = this.stringTable.map(s => {
      const encoded = new TextEncoder().encode(s);
      const result = new Uint8Array(2 + encoded.length);
      result[0] = encoded.length & 0xFF;
      result[1] = (encoded.length >> 8) & 0xFF;
      result.set(encoded, 2);
      return result;
    });

    const stringTableBuffer = new Uint8Array(stringData.reduce((sum, arr) => sum + arr.length, 0));
    let offset = 0;
    for (const arr of stringData) { stringTableBuffer.set(arr, offset); offset += arr.length; }

    const bytecodeBuffer = new Uint8Array(this.bytecode);
    const result = new Uint8Array(header.length + stringTableBuffer.length + bytecodeBuffer.length);
    result.set(header, 0);
    result.set(stringTableBuffer, header.length);
    result.set(bytecodeBuffer, header.length + stringTableBuffer.length);
    return result;
  }
}

// Build all scriptlets
async function buildScriptlets() {
  console.log('🔨 Building scriptlets...');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const compiler = new ScriptletCompiler();
  const scriptletsDir = SCRIPTLETS_DIR;

  // Read all .js files in scriptlets directory
  const files = readScriptletFiles(scriptletsDir);

  let compiled = 0;
  for (const { name, content } of files) {
    try {
      const bytecode = compiler.compile(content);
      const outputPath = join(OUTPUT_DIR, `${name}.aerobc`);
      writeFileSync(outputPath, Buffer.from(bytecode.buffer));
      console.log(`  ✓ ${name} (${bytecode.length} bytes)`);
      compiled++;
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  // Generate manifest
  const manifest = {
    version: 1,
    compiledAt: new Date().toISOString(),
    scriptlets: files.map(f => f.name),
    totalScriptlets: files.length,
    compiledScriptlets: compiled
  };
  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Built ${compiled}/${files.length} scriptlets`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);
}

function readScriptletFiles(dir) {
  const files = [];
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.aerobc')) {
        const content = readFileSync(fullPath, 'utf-8');
        const relativePath = fullPath.replace(dir + '/', '').replace('.js', '');
        files.push({ name: relativePath, content });
      }
    }
  }
  walk(dir);
  return files;
}

// Import fs and path
import { readdirSync } from 'fs';

// Run build
buildScriptlets().catch(console.error);