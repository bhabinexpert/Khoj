import { Link } from 'react-router-dom';
import { CompassIcon } from '../components/Icons.jsx';
import { EmptyState } from '../components/States.jsx';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<CompassIcon className="h-7 w-7" />}
      title="Page not found"
      hint="That URL does not exist on Khoj. The job feed is the best place to start."
      action={
        <Link to="/jobs" className="btn-primary">
          Go to the job feed
        </Link>
      }
    />
  );
}
