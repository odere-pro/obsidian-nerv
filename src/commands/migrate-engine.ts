/**
 * migrate-engine — IIFE expression builder for the migrate command.
 *
 * Builds the JavaScript expression that runs inside Obsidian to execute
 * migration operations. Separated from the CLI layer for clarity.
 */

import { encodeForJs } from '../lib/json';
import type { MigrateOp } from './migrate-spec';

/**
 * Build the Obsidian eval IIFE that executes the migration spec.
 *
 * The generated expression runs inside the Obsidian desktop app context
 * where `app.vault`, `app.fileManager`, and `app.metadataCache` are available.
 */
export function buildMigrateExpr(spec: MigrateOp[], slug: string, dryRun: boolean): string {
  const jsSpec = encodeForJs(JSON.stringify(spec));
  const jsSlug = encodeForJs(slug);
  const jsDryRun = dryRun ? 'true' : 'false';

  return `(async () => {
  var spec     = JSON.parse(${jsSpec});
  var projSlug = ${jsSlug};
  var dryRun   = ${jsDryRun};

  var projFolder = 'projects/' + projSlug;
  var allFiles   = app.vault.getMarkdownFiles();
  var projFiles  = allFiles.filter(function(f){
    return f.path.startsWith(projFolder + '/');
  });

  var escRe = function(s) {
    return s.replace(/[.*+?^${'$'}{}()|[\\]\\\\]/g, '\\\\$&');
  };

  var findArtifact = function(prefix) {
    return projFiles.find(function(f){
      return f.basename === '_' + prefix + '.' + projSlug;
    }) || null;
  };

  var todayStr = function() {
    return new Date().toISOString().split('T')[0];
  };

  /* Pre-flight validation */
  var errors    = [];
  var ontFile   = findArtifact('ontology');

  for (var vi = 0; vi < spec.length; vi++) {
    var vsop = spec[vi];
    var vop  = vsop.op;

    if (vop === 'rename-rel') {
      if (!ontFile) {
        errors.push('rename-rel[' + vi + ']: _ontology.' + projSlug + '.md not found in ' + projFolder);
        continue;
      }
      /* Skip validation if from-rel not in ontology — idempotent (already renamed) */
    } else if (vop === 'rename-spine') {
      /* Skip validation if no notes have old spine — idempotent (already renamed) */
    } else if (vop === 'promote') {
      var noteSearch = vsop.note || '';
      var candidate  = projFiles.find(function(f) {
        return f.basename === noteSearch ||
               f.basename.startsWith(noteSearch + ' - ') ||
               f.basename.toLowerCase().indexOf(noteSearch.toLowerCase()) !== -1;
      });
      if (!candidate) {
        errors.push('promote[' + vi + ']: note matching "' + noteSearch +
          '" not found in ' + projFolder);
      }
    }
  }

  if (errors.length > 0) {
    return JSON.stringify({ validationFailed: true, errors: errors });
  }

  /* Execute operations */
  var opResults = [];
  var vocabFile = findArtifact('vocab');

  for (var oi = 0; oi < spec.length; oi++) {
    var sop   = spec[oi];
    var op    = sop.op;
    var count = 0;
    var notes = [];

    if (op === 'rename-rel') {
      var fromRel  = sop.from;
      var toRel    = sop.to;
      var fromEscR = escRe(fromRel);

      for (var fi = 0; fi < projFiles.length; fi++) {
        var f = projFiles[fi];
        if (f.basename.startsWith('_')) continue;
        var body = await app.vault.cachedRead(f);
        if (!new RegExp('^(- )' + fromEscR + '( :: \\\\[\\\\[)', 'gm').test(body)) continue;
        if (!dryRun) {
          var captFE = fromEscR; var captTo = toRel;
          await app.vault.process(f, function(content) {
            return content.replace(
              new RegExp('^(- )' + captFE + '( :: \\\\[\\\\[)', 'gm'),
              '$1' + captTo + '$2'
            );
          });
        }
        count++;
        notes.push(f.path);
      }
      if (ontFile) {
        var ontBody2   = await app.vault.cachedRead(ontFile);
        var fromEscOnt = escRe(fromRel);
        if (new RegExp('\`' + fromEscOnt + '\`').test(ontBody2) && !dryRun) {
          var captFO = fromEscOnt; var captTO = toRel;
          await app.vault.process(ontFile, function(content) {
            return content.replace(new RegExp('\`' + captFO + '\`', 'g'), '\`' + captTO + '\`');
          });
          await app.fileManager.processFrontMatter(ontFile, function(fm) { fm.updated = todayStr(); });
        }
      }
      opResults.push({ op: op, from: fromRel, to: toRel, count: count, notes: notes });

    } else if (op === 'rename-spine') {
      var fromSpine = sop.from;
      var toSpine   = sop.to;
      for (var fi = 0; fi < projFiles.length; fi++) {
        var f      = projFiles[fi];
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};
        if (ffm.spine !== fromSpine) continue;
        if (!dryRun) {
          var captTS = toSpine;
          await app.fileManager.processFrontMatter(f, function(fmRef) { fmRef.spine = captTS; });
        }
        count++;
        notes.push(f.path);
      }
      if (vocabFile && !dryRun) {
        var fromSpineEsc = escRe(fromSpine);
        var vocabBody    = await app.vault.cachedRead(vocabFile);
        if (vocabBody.indexOf(fromSpine) !== -1) {
          var captFS = fromSpineEsc; var captTSV = toSpine;
          await app.vault.process(vocabFile, function(content) {
            return content.replace(new RegExp(captFS, 'g'), captTSV);
          });
          await app.fileManager.processFrontMatter(vocabFile, function(fm) {
            if (fm.spine === fromSpine) fm.spine = toSpine;
            fm.updated = todayStr();
          });
        }
      }
      opResults.push({ op: op, from: fromSpine, to: toSpine, count: count, notes: notes });

    } else if (op === 'add-field') {
      var fieldName  = sop.field;
      var fieldValue = sop.value;
      var filter     = sop.filter || {};
      for (var fi = 0; fi < projFiles.length; fi++) {
        var f      = projFiles[fi];
        if (f.basename.startsWith('_')) continue;
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};
        if (filter.type   && ffm.type   !== filter.type  ) continue;
        if (filter.spine  && ffm.spine  !== filter.spine ) continue;
        if (filter.kind   && ffm.kind   !== filter.kind  ) continue;
        if (filter.status && ffm.status !== filter.status) continue;
        if (fieldName in ffm) continue; /* idempotent */
        if (!dryRun) {
          var captFN = fieldName; var captFV = fieldValue;
          await app.fileManager.processFrontMatter(f, function(fmRef) { fmRef[captFN] = captFV; });
        }
        count++;
        notes.push(f.path);
      }
      opResults.push({ op: op, field: fieldName, value: fieldValue, count: count, notes: notes });

    } else if (op === 'promote') {
      var noteSearch = sop.note || '';
      var pf = projFiles.find(function(f) {
        return f.basename === noteSearch ||
               f.basename.startsWith(noteSearch + ' - ') ||
               f.basename.toLowerCase().indexOf(noteSearch.toLowerCase()) !== -1;
      });
      if (pf) {
        var pCache = app.metadataCache.getFileCache(pf);
        var pFm    = (pCache && pCache.frontmatter) ? pCache.frontmatter : {};
        if (pFm.type === 'BRANCH') {
          opResults.push({ op: op, note: noteSearch, from: pf.path, to: pf.path, count: 0, notes: [] });
        } else {
          var oldBn    = pf.basename;
          var dotIdx   = oldBn.indexOf('.');
          var prefix   = oldBn.substring(0, dotIdx);
          var rest     = oldBn.substring(dotIdx + 1);
          var slugPart = rest.split(' - ')[0];
          var newBn    = prefix + '.' + slugPart.toUpperCase() + '.' + rest;
          var newPath  = projFolder + '/' + newBn + '.md';
          if (!newPath.startsWith(projFolder + '/')) {
            opResults.push({ op: op, note: noteSearch, count: 0, error: 'path traversal rejected' });
          } else {
            if (!dryRun) {
              var captNP = newPath;
              await app.fileManager.processFrontMatter(pf, function(fmRef) {
                fmRef.type = 'BRANCH';
                if (!Array.isArray(fmRef.children)) fmRef.children = [];
                fmRef.modified = todayStr();
              });
              await app.fileManager.renameFile(pf, captNP);
            }
            notes.push(pf.path);
            opResults.push({ op: op, note: noteSearch, from: pf.path, to: newPath, count: 1, notes: notes });
          }
        }
      }
    }
  }

  var totalModified = opResults.reduce(function(s, r){ return s + (r.count || 0); }, 0);

  if (!dryRun && totalModified > 0) {
    var dailyPath = 'journals/daily/' + todayStr() + '.md';
    var dailyFile = app.vault.getAbstractFileByPath(dailyPath);
    if (dailyFile) {
      var opSummary = opResults.map(function(r) { return r.op + ':' + (r.count || 0); }).join(', ');
      await app.vault.append(dailyFile,
        '\\n## Migration Log\\n\\nProject: ' + projSlug + ' — ' + totalModified +
        ' notes modified (' + opSummary + ')\\n'
      );
    }
  }

  return JSON.stringify({ dryRun: dryRun, ops: opResults, totalModified: totalModified });
})()`;
}
