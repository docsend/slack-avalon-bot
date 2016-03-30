var gulp = require('gulp');
var mocha = require('gulp-mocha');
 
gulp.task('default', function () {
  return gulp.src('tests/avalon-spec.js', {read: false})
    .pipe(mocha({reporter: 'spec'}));
});
