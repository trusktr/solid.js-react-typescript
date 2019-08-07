"""
Copy the published annotations and the user activity logs for a session
from S3. Take the local files and grind them down into statistics.
"""

import argparse
import json
import os
import re
import subprocess

bucket = 'mapper-prod-session-data'
work_dir = '/tmp/annotator-activity'


def process(args):
    dest_dir = f"{work_dir}/{args.org_id}/{args.session_id}"
    os.makedirs(args.output_directory, exist_ok=True)

    args.annotations_source_dir = f"s3://{bucket}/{args.org_id}/{args.session_id}/anot1"
    args.annotations_source_file = f"{args.annotations_source_dir}/annotations.json"
    args.annotations_dest_dir = f"{dest_dir}/annotations"
    args.stats_source_dir = f"s3://{bucket}/{args.org_id}/stats/{args.session_id}"
    args.stats_dest_dir = f"{dest_dir}/stats"
    args.conversion_dest_file = f"{args.output_directory}/{args.session_id}.tsv"

    publish_timestamp = download(args)
    total_time = parse_logs(args)
    count_annotations(args)
    append_metadata(args, publish_timestamp, total_time)


def download(args):
    publish_timestamp = ''
    try:
        result = subprocess.check_output(['aws', 's3', 'ls', args.annotations_source_file])
        matches = re.search('^([\d-]+ [\d:]+)', result.decode("utf-8"))
        publish_timestamp = matches.group(0)
    except subprocess.CalledProcessError:
        print(f"session {args.session_id} has not been published")
        exit(1)

    try:
        subprocess.check_output(['aws', 's3', 'ls', args.stats_source_dir])
    except subprocess.CalledProcessError:
        print(f"session {args.session_id} has no activity stats")
        exit(1)

    print(f"copying files for {args.session_id}")
    sync_args = ['aws', 's3', 'sync', '--include', '"*.json"', '--delete', '--quiet']
    subprocess.check_output(sync_args + [args.annotations_source_dir, args.annotations_dest_dir])
    subprocess.check_output(sync_args + [args.stats_source_dir, args.stats_dest_dir])

    return publish_timestamp


# TODO filter stats which are newer than the published annotations
def parse_logs(args):
    total_time = 0

    directory = os.fsencode(args.stats_dest_dir)
    for file in os.listdir(directory):
        filename = os.fsdecode(file)
        if filename.endswith('.json'):
            p = json.load(open(os.path.join(args.stats_dest_dir, filename)))
            total_time += p['intervalSeconds']
    return total_time


def count_annotations(args):
    print(f"writing to {args.conversion_dest_file}  ")
    conversion_args = [
        args.path_to_mapper_semantic_conversion,
        '--input-format=annotator_json',
        '--output-format=statistics_tsv',
        args.annotations_dest_dir,
        args.conversion_dest_file,
    ]
    subprocess.check_output(conversion_args)


def append_metadata(args, publish_timestamp, total_time):
    with open(args.conversion_dest_file, 'a') as f:
        f.write(f"organization\tID\t{args.org_id}\n")
        f.write(f"session\tID\t{args.session_id}\n")
        f.write(f"published\ttimestamp\t{publish_timestamp}\n")
        f.write(f"annotator activity\ttime (s)\t{total_time}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path_to_mapper_semantic_conversion")
    parser.add_argument("output_directory")
    parser.add_argument("org_id")
    parser.add_argument("session_id")

    process(parser.parse_args())
