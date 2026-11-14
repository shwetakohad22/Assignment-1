// Fake stdin / stdout / stderr for in-process CLI tests (no real process streams).

export function createStdin(text) {
  return {
    async *[Symbol.asyncIterator]() {
      if (text !== '') {
        yield Buffer.from(text, 'utf8');
      }
    },
  };
}

export function createSink() {
  return {
    text: '',
    write(chunk) {
      this.text += String(chunk);
      return true;
    },
  };
}
