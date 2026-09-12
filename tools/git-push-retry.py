# -*- coding: utf-8 -*-
"""网络不稳时的健壮 git 推送/拉取工具：交替尝试 直连/代理，直到成功。"""
import subprocess
import os
import sys
import time

GIT = r'C:/Users/佳晨信/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe'
WD = r'D:/ruanjian/workbuddy工作空间/sunpanel/sunpanel-app'

BASE_ENV = dict(os.environ)
for k in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
    BASE_ENV.pop(k, None)
PROXY_ENV = dict(BASE_ENV)
PROXY_ENV['HTTPS_PROXY'] = PROXY_ENV['HTTP_PROXY'] = 'http://127.0.0.1:56272'


def run(args, env):
    p = subprocess.run([GIT] + args, cwd=WD, capture_output=True,
                       text=True, env=env, timeout=240)
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def resilient(args, attempts=24, pause=10):
    for i in range(attempts):
        env = PROXY_ENV if i % 2 == 0 else BASE_ENV
        rc, out = run(args + ['-c', 'http.version=HTTP/1.1'], env)
        tag = 'proxy' if i % 2 == 0 else 'direct'
        print('try %d(%s) rc=%d %s' % (i + 1, tag, rc, out.strip()[-200:]), flush=True)
        if rc == 0:
            return True
        time.sleep(pause)
    return False


if __name__ == '__main__':
    cmd = sys.argv[1:] or ['push', 'origin', 'main']
    print('RESULT_OK' if resilient(cmd) else 'RESULT_FAILED')
