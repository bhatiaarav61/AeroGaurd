/**
 * Scriptlet Compiler — ABP #%# to optimized bytecode
 * Compiles Adblock Plus scriptlet syntax to optimized bytecode
 */

export class ScriptletCompiler {
  constructor() {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap = new Map();
    this.currentLabel = 0;
    this.variableMap = new Map();
    this.nextVarIndex = 0;
  }

  /**
   * Compile scriptlet source to bytecode
   * @param {string} source - Scriptlet source code
   * @returns {Uint8Array} Bytecode
   */
  compile(source) {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap.clear();
    this.currentLabel = 0;
    this.variableMap.clear();
    this.nextVarIndex = 0;

    // Parse the scriptlet
    const ast = this._parse(source);

    // Compile AST to bytecode
    this._compileAST(ast);

    // Resolve labels
    this._resolveLabels();

    // Create final bytecode with string table
    return this._serializeBytecode();
  }

  _parse(source) {
    // Simplified parser for scriptlet syntax
    // Scriptlets are typically: name(arg1, arg2) or just name
    const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    return { type: 'Program', body: lines.map(l => this._parseStatement(l)) };
  }

  _parseStatement(line) {
    // Parse function call: name(arg1, arg2)
    const match = line.match(/^(\w+)\((.*)\)$/);
    if (match) {
      return {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: match[1] },
        arguments: this._parseArguments(match[2])
      };
    }

    // Simple identifier
    return {
      type: 'ExpressionStatement',
      expression: { type: 'Identifier', name: line }
    };
  }

  _parseArguments(argStr) {
    if (!argStr.trim()) return [];

    // Simple argument parsing - handles strings, numbers, identifiers
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

    if (current.trim()) {
      args.push(this._parseArgument(current.trim()));
    }

    return args;
  }

  _parseArgument(arg) {
    // String literal
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return { type: 'Literal', value: arg.slice(1, -1) };
    }

    // Number
    if (/^\d+$/.test(arg)) {
      return { type: 'Literal', value: parseInt(arg, 10) };
    }

    if (/^\d+\.\d+$/.test(arg)) {
      return { type: 'Literal', value: parseFloat(arg) };
    }

    // Boolean
    if (arg === 'true') return { type: 'Literal', value: true };
    if (arg === 'false') return { type: 'Literal', value: false };

    // Identifier
    return { type: 'Identifier', name: arg };
  }

  _compileAST(ast) {
    for (const stmt of ast.body) {
      this._compileStatement(stmt);
    }

    // Implicit return
    this._emit(OpCode.PUSH, 0);
    this._emit(OpCode.RETURN);
  }

  _compileStatement(stmt) {
    switch (stmt.type) {
      case 'CallExpression':
        this._compileCallExpression(stmt);
        break;
      case 'ExpressionStatement':
        this._compileExpression(stmt.expression);
        break;
    }
  }

  _compileCallExpression(expr) {
    // Compile arguments first (right to left for stack)
    for (let i = expr.arguments.length - 1; i >= 0; i--) {
      this._compileExpression(expr.arguments[i]);
    }

    // Push function name
    this._emit(OpCode.PUSH, this._getStringIndex(expr.callee.name));

    // Call
    this._emit(OpCode.CALL, expr.arguments.length);
  }

  _compileExpression(expr) {
    switch (expr.type) {
      case 'Literal':
        this._emit(OpCode.PUSH, this._getStringIndex(expr.value));
        break;
      case 'Identifier':
        this._emit(OpCode.LOAD_GLOBAL, this._getStringIndex(expr.name));
        break;
    }
  }

  _getStringIndex(str) {
    const index = this.stringTable.indexOf(str);
    if (index !== -1) return index;
    this.stringTable.push(str);
    return this.stringTable.length - 1;
  }

  _emit(...args) {
    for (const arg of args) {
      this.bytecode.push(arg);
    }
  }

  _resolveLabels() {
    // Resolve jump targets
  }

  _serializeBytecode() {
    // Header: magic bytes + version + string table size + bytecode size
    const header = new Uint8Array([
      0x41, 0x45, 0x52, 0x4F, // "AERO"
      0x01, 0x00, 0x00, 0x00, // version 1
      this.stringTable.length & 0xFF, (this.stringTable.length >> 8) & 0xFF,
      this.bytecode.length & 0xFF, (this.bytecode.length >> 8) & 0xFF, (this.bytecode.length >> 16) & 0xFF, (this.bytecode.length >> 24) & 0xFF
    ]);

    // String table
    const stringData = this.stringTable.map(s => {
      const encoded = new TextEncoder().encode(s);
      const len = encoded.length;
      const result = new Uint8Array(2 + len);
      result[0] = len & 0xFF;
      result[1] = (len >> 8) & 0xFF;
      result.set(encoded, 2);
      return result;
    });

    const totalStringSize = stringData.reduce((sum, arr) => sum + arr.length, 0);
    const stringTableBuffer = new Uint8Array(totalStringSize);
    let offset = 0;
    for (const arr of stringData) {
      stringTableBuffer.set(arr, offset);
      offset += arr.length;
    }

    // Bytecode
    const bytecodeBuffer = new Uint8Array(this.bytecode);

    // Combine all
    const totalSize = header.length + stringTableBuffer.length + bytecodeBuffer.length;
    const result = new Uint8Array(totalSize);
    result.set(header, 0);
    result.set(stringTableBuffer, header.length);
    result.set(bytecodeBuffer, header.length + stringTableBuffer.length);

    return result;
  }
}

// Re-export OpCode for use in compiler
export const OpCode = {
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