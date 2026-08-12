'use babel';

import CobolSyntaxHelperView from './cobol-syntax-helper-view';
import { CompositeDisposable } from 'atom';

const STEP = 10;

// A "sequence" is the 6-digit sequence number plus its trailing separator
// space, e.g. "000010 " - SEQUENCE_WIDTH (7) is the width of that whole
// field, as opposed to NUMBER_WIDTH (6), the width of the digits alone.
const NUMBER_WIDTH = 6;
const SEPARATOR = ' ';
const SEQUENCE_WIDTH = NUMBER_WIDTH + SEPARATOR.length;

function formatSequence(num, c=SEPARATOR) {
  return String(num).padStart(NUMBER_WIDTH, '0') + c;
}

function insertNextSequenceNumber(editor) {
  const buffer = editor.getBuffer();
  const cursorRow = editor.getCursorBufferPosition().row;

  // The new blank line was just inserted at cursorRow by insertNewline().
  // Look at the line above it for the previous sequence number.
  const prevRow = cursorRow - 1;

  let nextSeq = STEP; // default if there's no previous line to read from

  if (prevRow >= 0) {
    const prevLine = buffer.lineForRow(prevRow);
    const prevSeqNum = parseInt(prevLine.slice(0, NUMBER_WIDTH), 10);

    if (!isNaN(prevSeqNum)) {
      nextSeq = prevSeqNum + STEP;
    }
  }

  // Insert the sequence at the start of the (now current) line, pushing
  // whatever's already there (should be nothing yet) to the right.
  buffer.insert([cursorRow, 0], formatSequence(nextSeq));

  // Leave the cursor after the sequence, ready to type code.
  editor.setCursorBufferPosition([cursorRow, SEQUENCE_WIDTH]);
}

const COBOL_SCOPE_NAME = 'source.cobol';
const COBOL_FILE_EXTENSIONS = ['cbl', 'cob', 'cpy'];

function isCobolFile(editor) {
  if (editor.getGrammar().scopeName === COBOL_SCOPE_NAME) return true;

  const filePath = editor.getBuffer().getPath();
  if (!filePath) return false;

  const extension = filePath.split('.').pop().toLowerCase();
  return COBOL_FILE_EXTENSIONS.includes(extension);
}

function seedSequenceNumberIfNewCobolFile(editor) {
  if (editor.isDestroyed() || editor.getBuffer().isDestroyed()) return;
  if (!isCobolFile(editor)) return;
  if (!editor.getBuffer().isEmpty()) return;

  editor.getBuffer().transact(() => {
    insertNextSequenceNumber(editor);
  });
}

export default {

  cobolSyntaxHelperView: null,
  modalPanel: null,
  subscriptions: null,

  activate(state) {
    this.cobolSyntaxHelperView = new CobolSyntaxHelperView(state.cobolSyntaxHelperViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.cobolSyntaxHelperView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'cobol-syntax-helper:toggle': () => this.toggle()
    }));

    this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {
      seedSequenceNumberIfNewCobolFile(editor);

      // Scoped to this editor's own lifetime and disposed as soon as it's
      // destroyed (e.g. its file got deleted and Atom closed the tab), so
      // these listeners can never fire again on a buffer mid-teardown.
      const editorSubscriptions = new CompositeDisposable();

      editorSubscriptions.add(editor.onDidChangeGrammar(() => {
        seedSequenceNumberIfNewCobolFile(editor);
      }));
      // Grammar re-selection can race a Save-As of a new/untitled buffer
      // to a *.cbl path; re-check once the path itself changes too.
      editorSubscriptions.add(editor.getBuffer().onDidChangePath(() => {
        seedSequenceNumberIfNewCobolFile(editor);
      }));
      editorSubscriptions.add(editor.onDidDestroy(() => {
        editorSubscriptions.dispose();
      }));

      this.subscriptions.add(editorSubscriptions);
    }));

    this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'cobol-syntax-helper:newline-with-sequence': (event) => {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) return;
        editor.getBuffer().transact(() => {
          editor.insertNewline();
          insertNextSequenceNumber(editor);
        });
      }
    }));

    this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'cobol-syntax-helper:recalculate-sequence-numbers': () => {
        const editor = atom.workspace.getActiveTextEditor();
        const buffer = editor.getBuffer();

        const newText = buffer.getLines()
          .map((line, row) => {
            const sep = line[SEQUENCE_WIDTH - 1];
            const sequence = formatSequence((row + 1) * STEP, sep);
            return sequence + line.slice(SEQUENCE_WIDTH) + (buffer.lineEndingForRow(row) || '');
          })
          .join('');

        buffer.setText(newText);
      }
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.cobolSyntaxHelperView.destroy();
  },

  serialize() {
    return {
      cobolSyntaxHelperViewState: this.cobolSyntaxHelperView.serialize()
    };
  },

  toggle() {
    console.log('CobolSyntaxHelper was toggled!');
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

};
