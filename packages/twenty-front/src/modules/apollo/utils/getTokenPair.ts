import { isDefined } from 'twenty-shared/utils';
import { type AuthTokenPair } from '~/generated-metadata/graphql';
import { cookieStorage } from '~/utils/cookie-storage';
import { isValidAuthTokenPair } from './isValidAuthTokenPair';

export const getTokenPair = (): AuthTokenPair | undefined => {
  const stringTokenPair = cookieStorage.getItem('tokenPair');

  if (!isDefined(stringTokenPair)) {
    // oxlint-disable-next-line no-console
    console.log('tokenPair is undefined');

    return undefined;
  }

  try {
    const parsedTokenPair = JSON.parse(stringTokenPair);

    if (!isValidAuthTokenPair(parsedTokenPair)) {
      // oxlint-disable-next-line no-console
      console.log('tokenPair failed shape validation — clearing it');
      cookieStorage.removeItem('tokenPair');
      return undefined;
    }

    return parsedTokenPair;
  } catch {
    // oxlint-disable-next-line no-console
    console.log('tokenPair failed to parse — clearing it');
    cookieStorage.removeItem('tokenPair');
    return undefined;
  }
};
