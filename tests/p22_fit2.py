"""Second half of the fit matrix (tests/p21_fit.py): the older 4:3 iPads (1024x768, 1080x810, 1112x834 and portraits), text zoom,
iPad Pro, and home / practice door / lesson / summary at 1024x768 and 768x1024."""
import os, runpy, sys
os.environ['FIT_PART'] = '2'
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'p21_fit.py'), run_name='__main__')
