"""Import the verified atlas ZIP attached to a GitHub Release."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import shutil
import tempfile
import urllib.request
import zipfile

EXPECTED_NAME = 'Atlas-rostlin-web-opraveny.zip'
EXPECTED_SIZE = 103052667
EXPECTED_SHA256 = '35b4bf8c1d6741864219d31e665be239c06ba1ae20a580d85f9ff0c6473b386b'


def extract(archive, root):
    with zipfile.ZipFile(archive) as source:
        assert source.testzip() is None, 'Invalid archive'
        entries = []
        for item in source.infolist():
            path = PurePosixPath(item.filename)
            assert not path.is_absolute() and '..' not in path.parts
            assert path.parts[0] == 'Atlas-rostlin'
            if item.is_dir():
                continue
            relative = Path(*path.parts[1:])
            assert relative.parts and relative.parts[0] not in ('.git', '.github')
            target = root / relative
            if target.exists():
                assert target.is_file() and target.read_bytes() == source.read(item), 'Refusing to overwrite changed file: ' + str(relative)
            entries.append((item, target))
        assert len(entries) == 2586, 'File count mismatch'
        for item, target in entries:
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(item) as incoming, target.open('wb') as output:
                shutil.copyfileobj(incoming, output)
    print('Imported and verified 2586 files, including all photographs.')


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    repo = os.environ['GITHUB_REPOSITORY']
    release = event.get('release')
    if release is None:
        req = urllib.request.Request('https://api.github.com/repos/' + repo + '/releases/latest', headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(req, timeout=60) as response:
            release = json.load(response)
    assets = [a for a in release.get('assets', []) if a['name'] == EXPECTED_NAME]
    assert len(assets) == 1, 'Attach ' + EXPECTED_NAME + ' to the release before publishing it.'
    asset = assets[0]
    assert asset['size'] == EXPECTED_SIZE, 'The attached ZIP is incomplete or is not the repaired archive.'
    url = asset['browser_download_url']
    assert url.startswith('https://github.com/' + repo + '/releases/download/')
    with tempfile.TemporaryFile() as archive:
        digest = hashlib.sha256()
        size = 0
        with urllib.request.urlopen(url, timeout=120) as response:
            while data := response.read(1024 * 1024):
                size += len(data)
                assert size <= EXPECTED_SIZE, 'Unexpected archive size'
                digest.update(data)
                archive.write(data)
        assert size == EXPECTED_SIZE and digest.hexdigest() == EXPECTED_SHA256, 'Archive verification failed'
        archive.seek(0)
        extract(archive, Path.cwd())


if __name__ == '__main__':
    main()
