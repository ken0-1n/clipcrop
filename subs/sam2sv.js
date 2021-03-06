var dirs = require('../config').dirs;
var SR = require('samreader');
var fs = require("fs");
var BPInfo = require(dirs.FORMATS + "bpinfo");
var FASTAName = require(dirs.FORMATS + "fastaname");
// require("termcolor").define;

/**
 * sam2sv
 * call SVs from a sam file of clipping sequences
 **/
function sam2sv(samfile) {
  var sam = new SR(fs.createReadStream(samfile));

  sam.on('alignment', function(aln) {
    /**
     * get the original breakpoint which generated this clipped sequence
     **/
    var bp = BPInfo.parse(aln.name);

    var rev      = aln.flags.reversed;
    var unmapped = aln.flags.unmapped;

    /**
     * if unmapped, assumes INSERTION
     **/
    if (unmapped) {
      printSVInfo({
        rname: bp.rname,
        start: bp.start,
        end  : bp.start +1,
        type : 'INS',
        len  : '*',
        rname2 : '=',
        others : {
          LR  : bp.LR,
          size: bp.size
        }
      });
      return;
    }

    /**
     * get mapped reference info from rname
     **/
    var f = FASTAName.parse(aln.rname);

    /**
     * get the position of another breakpoint
     *
     * if original LR equals L, and not reversed,
     * or original LR equals R, and reversed,
     **/

    var start = Number(aln.pos) -1;
    var theOtherBPStart = f.start + ((bp.LR == 'L' ^ rev)? (start + aln.cigar.len()) : start);


    /**
     * if rname is different, assumes InterChromosomal Translocation
     **/
    if (f.code != bp.code) {

      /**
       * < the definition of translocation patterns >
       * 
       * Let's think of two chromosomes, A and C
       *
       * <chromosome A>
       * AAAAAAAAAAAA|AAAAAA (+ strand)
       * aaaaaaaaaaaa|aaaaaa (- strand)
       *
       * <chromosome A>
       * CCCCCCCCCCCC|CCCCCC (+ strand)
       * cccccccccccc|cccccc (- strand)
       *
       * <translocation type 1>
       * AAAAAAAAAAAA|CCCCCC
       * aaaaaaaaaaaa|cccccc
       *
       * <translocation type 2>
       * AAAAAAAAAAAA|cccccccccccccc
       * aaaaaaaaaaaa|CCCCCCCCCCCCCC
       *
       * <translocation type 3>
       * CCCCCCCCCCCC|AAAAAA
       * cccccccccccc|aaaaaa
       *
       * <translocation type 4>
       * ccccc|AAAAAA
       * CCCCC|aaaaaa
       *
       **/

      /**
       * get the second breakpoint
       **/
      var bp2 = {
        code  : f.code,
        rname : f.rname,
        start : theOtherBPStart,
        LR    : (bp.LR == 'R' ^ rev) ? 'L' : 'R'
      };

      /**
       * name the smaller breakpoint as bpA, and the other, bpB
       **/
      var BPIsLargerThanBP2 = (bp.code > bp2.code);
      var bpA = (BPIsLargerThanBP2) ? bp2 : bp;
      var bpB = (BPIsLargerThanBP2) ? bp  : bp2;

      /**
       * get the type of translocation
       **/
      var subtype = (bpA.LR == 'R') ? 1: 3;
      if (rev) subtype++;

      printSVInfo({
        rname   : bpA.rname,
        start   : bpA.start,
        end     : bpA.start + 1,
        type    : 'CTX',
        subtype : subtype,
        len     : "*",
        rname2  : bpB.rname,
        start2  : bpB.start,
        others  : {
          LR      : (bpA.code == bp.code) ? 'L' : 'R',  // for balancing
          size    : bp.size
        }
      });
      return;
    }


    // filter if bp.start equals to the other bp.start
    if (theOtherBPStart == bp.start) {
      return;
    }


    // set the smaller one as SV start
    var start = (theOtherBPStart > bp.start) ? bp.start: theOtherBPStart;

    var len = Math.abs(theOtherBPStart - bp.start);


    /**
     * if the start of a left clipped sequence is smaller than the other breakpoint or vice versa,
     * it's tandem duplication.
     **/
    var isDup = (bp.LR == 'L' ^ (bp.start > theOtherBPStart));

    /**
     * if rev: INV
     *
     * if isDup: DUP
     * else DEL
     **/
    var type = (rev)? 'INV' : (isDup)? 'DUP' : 'DEL';


    printSVInfo({
      rname  : bp.rname,
      start  : start,       // 0-based coordinate system
      end    : start + len, // 0-based coordinate system
      type   : type,
      len    : len,
      rname2 : '=',
      others : {
        LR   : bp.LR,
        size : bp.size
      }
    });
  });
}

/**
 * print SV information
 **/
function printSVInfo(svinfo) {
  var sortkey = [
    pad(svinfo.code, 2), 
    pad(svinfo.code2 || svinfo.code, 2),
    pad(svinfo.start, 10),
    pad(svinfo.len, 9),
    svinfo.others.LR,
    svinfo.type
  ].join("");

  console.log([sortkey, JSON.stringify(svinfo)].join('\t'));
}


/**
 * padding zeros
 **/
function pad(n, order) {
  if (!n) {
    n = 0;
  }
  n = n.toString();
  var ret = [n];
  for (var i=n.length; i<=order;i++) {
    ret.unshift("0");
  }
  return ret.join("");
}



if (__filename == process.argv[1]) {
  sam2sv(process.argv[2]);
}

module.exports = sam2sv;
